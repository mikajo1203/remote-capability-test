# Deployment

## Prerequisites

- A Cloudflare account with Workers enabled
- A GitHub repository whose default deployment branch is `main`
- Current Node.js and npm

Do not commit API tokens, account secrets, `.env`, or `.dev.vars` files. The repository `.gitignore` excludes those local files.

## 1. Deploy the Cloudflare Worker

From the repository root:

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Wrangler prints a URL similar to:

```text
https://remote-capability-test.<account-subdomain>.workers.dev
```

No Durable Object, KV, database, or other binding is needed.

Cloudflare currently recommends `wrangler.jsonc` for new projects. The checked-in file is the deployment source of truth. `ALLOWED_ORIGIN` is ordinary non-secret configuration, not a credential.

## 2. Configure the two origins

Edit `frontend/config.js` so it contains the deployed Worker URL without a trailing slash:

```js
window.APP_CONFIG = Object.freeze({
  API_BASE_URL: "https://remote-capability-test.<account-subdomain>.workers.dev"
});
```

Edit `worker/wrangler.jsonc` and set the exact GitHub Pages origin:

```jsonc
"vars": {
  "ALLOWED_ORIGIN": "https://<username>.github.io"
}
```

An origin contains only scheme, host, and optional port. For a project page at `https://<username>.github.io/<repo>/`, do not include `/<repo>/` in `ALLOWED_ORIGIN`.

Deploy the Worker again after this change:

```bash
cd worker
npx wrangler deploy
```

The configuration intentionally does not use `Access-Control-Allow-Origin: *`. For temporary local development, the committed configuration allows only `http://localhost:8000`.

## 3. Enable and deploy GitHub Pages

1. Push the repository to GitHub with `main` as the deployment branch.
2. Open the repository **Settings**.
3. Select **Pages**.
4. Under **Build and deployment**, choose **Source: GitHub Actions**.
5. Push a change under `frontend/` (or run the workflow manually from the Actions tab).

`.github/workflows/deploy-pages.yml` checks out the repository, configures Pages, uploads only `frontend/`, and deploys it. It has the required `pages: write` and `id-token: write` permissions and deploys to the `github-pages` environment.

Expected URL:

```text
https://<username>.github.io/<repo>/
```

## 4. Production smoke test

Open the GitHub Pages URL in a current Chrome release and choose **Run all tests**. Expected results on an unrestricted baseline network:

```text
Page Load          PASS
JavaScript         PASS
HTTPS Fetch        PASS
SSE                PASS
HTTP Streaming     PASS
WebSocket          PASS (after at least 30 seconds)
```

If Fetch, SSE, and streaming all fail immediately, first check `API_BASE_URL` and the exact `ALLOWED_ORIGIN`. If only WebSocket fails, inspect its close code and whether the environment permits WebSocket upgrades. If HTTPS Pages attempts to call an `http://` Worker URL, the browser will block mixed content; production must use the Worker's `https://` URL, which becomes `wss://` for WebSocket automatically.

## Optional non-interactive Cloudflare automation

For CI, use a narrowly scoped Cloudflare API token stored in the CI secret store and exposed to Wrangler as `CLOUDFLARE_API_TOKEN`. Never put it in `wrangler.jsonc` or commit it. Interactive local deployment should use `npx wrangler login`.

