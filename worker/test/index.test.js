import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = { ALLOWED_ORIGIN: "https://example.github.io" };

function request(path, options = {}) {
  return new Request(`https://worker.example${path}`, {
    headers: { Origin: env.ALLOWED_ORIGIN, ...options.headers },
    method: options.method || "GET"
  });
}

test("GET /api/ping returns an ISO timestamp and CORS headers", async () => {
  const response = await worker.fetch(request("/api/ping"), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.ok(!Number.isNaN(Date.parse(body.timestamp)));
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), env.ALLOWED_ORIGIN);
  assert.equal(response.headers.get("Vary"), "Origin");
});

test("OPTIONS returns the expected preflight headers", async () => {
  const response = await worker.fetch(request("/api/ping", { method: "OPTIONS" }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
});

test("a disallowed origin is rejected without an allow-origin header", async () => {
  const response = await worker.fetch(new Request("https://worker.example/api/ping", {
    headers: { Origin: "https://untrusted.example" }
  }), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("unknown routes return 404", async () => {
  const response = await worker.fetch(request("/missing"), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).ok, false);
});

test("stream response arrives as multiple chunks", async () => {
  const response = await worker.fetch(request("/api/stream"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  while (chunks.length < 3) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  await reader.cancel();
  assert.deepEqual(chunks, ["chunk-1\n", "chunk-2\n", "chunk-3\n"]);
});

