# Test plan

## Goal

Establish a known-good baseline on a normal network, then run the identical page in the managed browser environment. Compare per-capability PASS/FAIL states and diagnostics without collecting sensitive network or identity data.

## Preconditions

- The frontend is served over HTTPS from GitHub Pages.
- `frontend/config.js` points to the deployed HTTPS Worker.
- The Worker's `ALLOWED_ORIGIN` is the exact GitHub Pages origin.
- Tests are run in a current, supported browser with JavaScript enabled.

## Baseline test

1. Open the page on a normal, unrestricted network.
2. Confirm Page Load and JavaScript show PASS.
3. Select **Run all tests**.
4. Wait approximately 46 seconds for the sequential run.
5. Confirm all four remote capabilities show PASS.
6. Use **Copy results** and check that the output includes timings, counts, and any error but no IP, cookie, authorization, account, hostname, credential, or interface data.
7. Check the browser console for uncaught exceptions.

Expected baseline:

```text
Page Load          PASS
JavaScript         PASS
HTTPS Fetch        PASS
SSE                PASS (at least 5 events)
HTTP Streaming     PASS (multiple time-separated chunks)
WebSocket          PASS (multiple echoes and 30-second survival)
```

## Managed environment test

1. Open the same deployed page in the managed browser.
2. Run all tests once; do not run tests in parallel.
3. Copy the result text after completion.
4. Compare each capability and its measurements with the baseline.
5. If a capability fails, repeat only that test once to distinguish a transient failure.

Interpret results independently. For example, a passing HTTPS Fetch with failing SSE may indicate event-stream buffering or blocking; a passing stream with failing WebSocket may indicate blocked Upgrade traffic. The displayed error category is diagnostic evidence, not a definitive identification of the network device or policy responsible.

## Automated Worker checks

Run `npm test` under `worker/`. The suite covers:

- `/api/ping` response shape and status
- allowed-origin and preflight CORS headers
- rejection of a disallowed origin
- unknown route returning 404
- `/api/stream` producing multiple chunks

WebSocket duration and browser-origin behavior are verified through the end-to-end browser test because Node's standard test runner does not reproduce Cloudflare's `WebSocketPair` runtime by itself.

## Timeout expectations

| Capability | Test window | Hard timeout |
| --- | ---: | ---: |
| HTTPS Fetch | response-driven | 10 sec |
| SSE | 10 sec | 15 sec |
| HTTP streaming | about 5 sec | 15 sec |
| WebSocket | 30 sec | 38 sec |

Every timeout results in FAIL with `Reason: Timeout`; the UI does not remain in TESTING indefinitely.

## Future work

Phase 2: WebRTC Connectivity Test

- Signaling
- ICE
- STUN
- TURN
- UDP availability

WebRTC is intentionally not implemented and no WebRTC dependencies are included in this version.

