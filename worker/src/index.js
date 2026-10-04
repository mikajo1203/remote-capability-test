const encoder = new TextEncoder();

function allowedOrigin(request, env) {
  const configured = (env.ALLOWED_ORIGIN || "http://localhost:8000").replace(/\/$/, "");
  const origin = request.headers.get("Origin");
  return !origin || origin.replace(/\/$/, "") === configured ? configured : null;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) }
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timedStream({ count, intervalMs, makeChunk }) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  void (async () => {
    try {
      for (let index = 1; index <= count; index += 1) {
        await writer.write(encoder.encode(makeChunk(index)));
        if (index < count) await delay(intervalMs);
      }
      await writer.close();
    } catch {
      // The browser intentionally cancels SSE after its sample window.
      try { await writer.abort(); } catch { /* stream is already closed */ }
    }
  })();
  return readable;
}

function websocketResponse(request, origin) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return json({ ok: false, error: "Expected Upgrade: websocket" }, 426, origin);
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.addEventListener("message", (event) => {
    if (typeof event.data === "string" || event.data instanceof ArrayBuffer) {
      server.send(event.data);
    } else {
      server.close(1003, "Unsupported message type");
    }
  });
  server.addEventListener("error", () => {
    try { server.close(1011, "Echo error"); } catch { /* already closed */ }
  });

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (!origin) {
      return new Response(JSON.stringify({ ok: false, error: "Origin not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8", "Vary": "Origin" }
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return json({ ok: false, error: "Method not allowed" }, 405, origin);
    }

    if (url.pathname === "/api/ping") {
      return json({ ok: true, timestamp: new Date().toISOString() }, 200, origin);
    }

    if (url.pathname === "/api/sse") {
      const body = timedStream({
        count: 12,
        intervalMs: 1000,
        makeChunk: (sequence) => `event: tick\ndata: ${JSON.stringify({ sequence, timestamp: new Date().toISOString() })}\n\n`
      });
      return new Response(body, {
        encodeBody: "manual",
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Content-Encoding": "identity",
          "Connection": "keep-alive",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    if (url.pathname === "/api/stream") {
      const body = timedStream({
        count: 10,
        intervalMs: 500,
        makeChunk: (sequence) => `chunk-${sequence}\n`
      });
      return new Response(body, {
        encodeBody: "manual",
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Content-Encoding": "identity",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

    if (url.pathname === "/ws") return websocketResponse(request, origin);

    return json({ ok: false, error: "Not found" }, 404, origin);
  }
};
