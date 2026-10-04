# Architecture

## Components

```text
Managed browser
      │
      ▼
GitHub Pages
Static HTML / CSS / JavaScript
      │
      ├── GET /api/ping       HTTPS Fetch
      ├── GET /api/sse        Server-Sent Events
      ├── GET /api/stream     streaming Fetch
      └── GET /ws + Upgrade   WebSocket echo
              │
              ▼
      Cloudflare Worker
```

The frontend is intentionally buildless. This removes framework, package CDN, bundler, and runtime dependencies that could otherwise be mistaken for network failures. `frontend/config.js` is the single source for the Worker base URL.

The Worker uses ES modules and remains stateless. WebSocket echo uses Cloudflare's `WebSocketPair`, which is sufficient for a single client connection and needs neither Durable Objects nor persistent storage.

## Capability checks

### HTTPS Fetch

The browser sends `GET /api/ping`, records request and response timing, checks for HTTP 200, parses JSON, and requires `ok: true`. The Worker returns the result plus a server-side ISO-8601 timestamp. The browser aborts after 10 seconds.

### Server-Sent Events

The Worker emits a named `tick` event once per second. The browser opens an `EventSource`, samples for 10 seconds, and passes after receiving at least five events. It then explicitly closes the connection. A separate 15-second timeout prevents an indefinitely testing UI.

### HTTP streaming

The Worker enqueues ten newline-delimited chunks about 500 ms apart. The browser consumes `response.body` through a `ReadableStream` reader. It records first-chunk delay and arrival times, and requires at least three chunks whose observed arrivals span at least 500 ms. This distinguishes incremental delivery from a fully buffered response. The request aborts after 15 seconds.

### WebSocket

The browser upgrades `/ws`, then sends a unique text probe every three seconds. The Worker echoes each message exactly. The browser correlates each echo to measure round-trip time, requires at least five echoes, and keeps the socket open for 30 seconds. It records close code and reason, including abnormal code 1006. A 38-second ceiling handles handshakes or sockets that stall.

## CORS and origin checks

`ALLOWED_ORIGIN` is an exact origin such as `https://username.github.io`. HTTP endpoints return that value in `Access-Control-Allow-Origin` only when the request origin matches. A mismatched origin receives 403 without an allow-origin header. WebSocket handshakes use the same `Origin` check because WebSocket is not protected by ordinary browser CORS enforcement.

Requests without an `Origin` header remain usable for direct operational checks such as `curl`, but the response still advertises only the configured allowed origin.

## Data handling

All counters and timing measurements remain in browser memory. Copy Results creates a local plain-text summary and deliberately omits URLs, IP addresses, headers, cookies, user/account details, and environment information. The Worker does not log application data or use storage.

