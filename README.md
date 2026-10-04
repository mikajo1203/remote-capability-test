# Remote Capability Test

Remote Capability Test is a small, privacy-conscious diagnostic tool for checking whether a managed browser supports standard web capabilities: HTTPS Fetch, Server-Sent Events (SSE), HTTP streaming, and WebSocket. It does not implement WebRTC in this version.

The project has two independent deployment targets:

```text
Browser
  └─ GitHub Pages (frontend/)
       ├─ HTTPS Fetch
       ├─ SSE
       ├─ HTTP streaming
       └─ WebSocket
            └─ Cloudflare Worker (worker/)
```

## Repository layout

- `frontend/` — static HTML, CSS, and vanilla JavaScript for GitHub Pages
- `worker/` — stateless Cloudflare Worker and Node-based tests
- `docs/architecture.md` — protocol flows and design choices
- `docs/deployment.md` — complete GitHub Pages and Worker deployment guide
- `docs/test-plan.md` — baseline and managed-environment test procedure

## Local development

Requirements: a current Node.js release and npm.

1. Install and start the Worker:

   ```bash
   cd worker
   npm install
   npm run dev
   ```

2. In another terminal, serve the static frontend from the repository root:

   ```bash
   python3 -m http.server 8000 --directory frontend
   ```

3. Open `http://localhost:8000`. The committed local defaults match: `frontend/config.js` points to `http://localhost:8787`, and `worker/wrangler.jsonc` allows `http://localhost:8000`.

4. Run the Worker tests:

   ```bash
   cd worker
   npm test
   ```

Do not open `frontend/index.html` directly with a `file:` URL; use a local HTTP server so browser security behavior is representative.

## Deployment overview

1. Deploy the Cloudflare Worker with Wrangler.
2. Put the resulting HTTPS Worker URL in `frontend/config.js`.
3. Set `ALLOWED_ORIGIN` in `worker/wrangler.jsonc` to the exact GitHub Pages origin (scheme and host, with no repository path or trailing slash), then deploy the Worker again.
4. In the GitHub repository, select **Settings → Pages → Source: GitHub Actions**.
5. Push the frontend configuration to `main`; `.github/workflows/deploy-pages.yml` publishes `frontend/`.

See [docs/deployment.md](docs/deployment.md) for exact commands and configuration examples.

## Security and privacy scope

This tool sends fixed diagnostic messages only to its configured Worker. It does not collect or copy public/local IP addresses, cookies, authorization headers, account details, stored credentials, internal hostnames, network interfaces, or arbitrary browsing data. There is no login, analytics, database, persistence, arbitrary URL fetch, relay, proxy, VPN, tunnel, TCP forwarding, shell, remote desktop, or network-policy bypass capability.

The Worker is stateless and exposes only four fixed routes. Production CORS is restricted to the configured `ALLOWED_ORIGIN`; the project never uses a permanent wildcard origin.

## Expected test duration

- HTTPS Fetch: normally under 1 second; 10-second timeout
- SSE: 10-second sample; 15-second timeout
- HTTP streaming: about 5 seconds; 15-second timeout
- WebSocket: 30-second survival test; 38-second timeout

A complete sequential run normally takes about 46 seconds.

