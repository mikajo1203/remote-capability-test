"use strict";

const TEST_NAMES = {
  fetch: "HTTPS Fetch",
  sse: "SSE",
  stream: "HTTP Streaming",
  websocket: "WebSocket"
};
const ENDPOINT_STORAGE_KEY = "remote-capability-test.api-base-url";

const state = Object.fromEntries(Object.keys(TEST_NAMES).map((key) => [key, {
  status: "NOT TESTED",
  fields: {},
  reason: ""
}]));

let runningAll = false;
let lastTestTime = null;
let configuredBaseUrl = "";

function normaliseApiBase(value) {
  const url = new URL(String(value || "").trim());
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("Enter an HTTP or HTTPS Worker URL without credentials, a query, or a fragment");
  }
  return url.toString().replace(/\/$/, "");
}

function updateEndpointStatus(message) {
  document.getElementById("endpoint-status").textContent = message;
}

function readSavedEndpoint() {
  try { return localStorage.getItem(ENDPOINT_STORAGE_KEY); }
  catch { return null; }
}

function saveEndpoint(value) {
  try {
    localStorage.setItem(ENDPOINT_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

function clearSavedEndpoint() {
  try { localStorage.removeItem(ENDPOINT_STORAGE_KEY); }
  catch { /* the in-page value is already cleared */ }
}

function resetAllTests() {
  for (const key of Object.keys(TEST_NAMES)) {
    state[key] = { status: "NOT TESTED", fields: {}, reason: "" };
    const card = document.querySelector(`[data-test="${key}"]`);
    card.dataset.state = "not-tested";
    const statusNode = card.querySelector("[data-status]");
    statusNode.textContent = "NOT TESTED";
    statusNode.className = "status status-not-tested";
    card.querySelectorAll("[data-field]").forEach((node) => {
      node.textContent = node.dataset.field === "error" ? "None" : "—";
    });
  }
  lastTestTime = null;
  document.getElementById("test-time").textContent = "No test run yet";
  renderSummary();
}

function applyEndpoint(event) {
  event.preventDefault();
  if (runningAll || Object.values(state).some((item) => item.status === "TESTING")) return;
  const input = document.getElementById("api-base-url");
  const rawValue = input.value.trim();
  if (!rawValue) {
    configuredBaseUrl = "";
    clearSavedEndpoint();
    resetAllTests();
    updateEndpointStatus("No endpoint configured. You can review the page now and add one when a Worker is available.");
    return;
  }
  try {
    configuredBaseUrl = normaliseApiBase(rawValue);
    input.value = configuredBaseUrl;
    resetAllTests();
    updateEndpointStatus(saveEndpoint(configuredBaseUrl)
      ? "Endpoint applied on this browser. Run a test when you are ready."
      : "Endpoint applied for this page session. Browser storage is unavailable.");
  } catch (error) {
    updateEndpointStatus(error.message);
    input.focus();
  }
}

function initialiseEndpoint() {
  const input = document.getElementById("api-base-url");
  const saved = readSavedEndpoint();
  const candidate = saved || window.APP_CONFIG?.API_BASE_URL || "";
  if (!candidate) return;
  try {
    configuredBaseUrl = normaliseApiBase(candidate);
    input.value = configuredBaseUrl;
    updateEndpointStatus("Endpoint loaded from this browser. Run a test when you are ready.");
  } catch {
    clearSavedEndpoint();
  }
}

function apiBase() {
  if (!configuredBaseUrl) {
    throw new Error("Test endpoint URL is not configured");
  }
  return configuredBaseUrl;
}

function endpoint(path) {
  return `${apiBase()}${path}`;
}

function websocketEndpoint(path) {
  const url = new URL(endpoint(path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function formatMs(value) {
  return Number.isFinite(value) ? `${Math.round(value)} ms` : "—";
}

function formatDuration(value) {
  return Number.isFinite(value) ? `${(value / 1000).toFixed(1)} sec` : "—";
}

function formatClock(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(date);
}

function classifyError(error, context = "request") {
  const message = String(error?.message || error || "Unknown error");
  if (error?.name === "AbortError" || /timeout/i.test(message)) return "Timeout";
  if (/CORS/i.test(message)) return "CORS blocked or origin not allowed";
  if (/network|fetch|load failed|failed to fetch/i.test(message)) {
    return context === "websocket"
      ? "WebSocket handshake, DNS, or connection failure"
      : "DNS, connection, or CORS failure";
  }
  if (/premature|closed|terminated/i.test(message)) return "Stream prematurely closed";
  return message;
}

function setState(key, status, fields = {}, reason = "") {
  state[key] = { status, fields: { ...state[key].fields, ...fields }, reason };
  const card = document.querySelector(`[data-test="${key}"]`);
  const statusNode = card.querySelector("[data-status]");
  statusNode.textContent = status;
  statusNode.className = `status status-${status.toLowerCase().replace(" ", "-")}`;
  card.dataset.state = status.toLowerCase().replace(" ", "-");
  Object.entries(fields).forEach(([field, value]) => {
    const node = card.querySelector(`[data-field="${field}"]`);
    if (node) node.textContent = value ?? "—";
  });
  renderSummary();
}

function renderSummary() {
  const summary = document.getElementById("summary-grid");
  summary.replaceChildren(...Object.entries(TEST_NAMES).map(([key, label]) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    const name = document.createElement("span");
    name.textContent = label;
    const status = document.createElement("strong");
    status.className = `status status-${state[key].status.toLowerCase().replace(" ", "-")}`;
    status.textContent = state[key].status;
    item.append(name, status);
    return item;
  }));

  const statuses = Object.values(state).map((result) => result.status);
  let overall = "NOT TESTED";
  if (statuses.includes("TESTING")) overall = "TESTING";
  else if (statuses.includes("FAIL")) overall = "FAIL";
  else if (statuses.every((status) => status === "PASS")) overall = "PASS";
  const overallNode = document.getElementById("overall-status");
  overallNode.textContent = overall;
  overallNode.className = `status status-${overall.toLowerCase().replace(" ", "-")}`;
}

function resetFields(key, fields) {
  const values = Object.fromEntries(fields.map((field) => [field, field === "error" ? "None" : "—"]));
  state[key].fields = {};
  setState(key, "TESTING", values);
}

async function testFetch() {
  resetFields("fetch", ["latency", "httpStatus", "responseTime", "error"]);
  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint("/api/ping"), {
      cache: "no-store",
      signal: controller.signal
    });
    const elapsed = performance.now() - start;
    let body;
    try { body = await response.json(); } catch { throw new Error("Unexpected response: invalid JSON"); }
    const fields = {
      latency: formatMs(elapsed),
      responseTime: formatClock(),
      httpStatus: String(response.status)
    };
    if (!response.ok) throw Object.assign(new Error(`HTTP status failure: ${response.status}`), { fields });
    if (body.ok !== true) throw Object.assign(new Error("Unexpected response: ok was not true"), { fields });
    setState("fetch", "PASS", { ...fields, error: "None" });
  } catch (error) {
    const reason = classifyError(error);
    setState("fetch", "FAIL", { ...error.fields, error: reason }, reason);
  } finally {
    clearTimeout(timer);
  }
}

function testSse() {
  resetFields("sse", ["messages", "duration", "lastEvent", "error"]);
  return new Promise((resolve) => {
    const start = performance.now();
    let messages = 0;
    let opened = false;
    let finished = false;
    let source;
    let sampleTimer;

    const finish = (pass, reason = "") => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutTimer);
      clearTimeout(sampleTimer);
      source?.close();
      const duration = performance.now() - start;
      setState("sse", pass ? "PASS" : "FAIL", {
        messages: String(messages),
        duration: formatDuration(duration),
        error: reason || "None"
      }, reason);
      resolve();
    };

    const timeoutTimer = setTimeout(() => finish(false, "Timeout"), 15_000);
    try {
      source = new EventSource(endpoint("/api/sse"));
      source.onopen = () => {
        opened = true;
        sampleTimer = setTimeout(() => {
          finish(messages >= 5, messages >= 5 ? "" : "Unexpected response: fewer than 5 events");
        }, 10_000);
      };
      source.addEventListener("tick", () => {
        messages += 1;
        setState("sse", "TESTING", {
          messages: String(messages),
          duration: formatDuration(performance.now() - start),
          lastEvent: formatClock()
        });
      });
      source.onerror = () => {
        if (!finished && (!opened || source.readyState === EventSource.CLOSED)) {
          finish(false, opened ? "SSE connection closed unexpectedly" : "SSE connection, CORS, or DNS failure");
        }
      };
    } catch (error) {
      finish(false, classifyError(error));
    }
  });
}

async function testStream() {
  resetFields("stream", ["chunks", "firstDelay", "duration", "error"]);
  const start = performance.now();
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), 15_000);
  let lineCount = 0;
  let firstDelay;
  const arrivalTimes = [];
  let buffered = "";
  try {
    const response = await fetch(endpoint("/api/stream"), { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP status failure: ${response.status}`);
    if (!response.body) throw new Error("Streaming ReadableStream is unavailable");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const arrival = performance.now();
      if (firstDelay === undefined) firstDelay = arrival - start;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop();
      for (const line of lines) {
        if (/^chunk-\d+$/.test(line.trim())) {
          lineCount += 1;
          arrivalTimes.push(arrival);
        }
      }
      setState("stream", "TESTING", {
        chunks: String(lineCount),
        firstDelay: formatMs(firstDelay),
        duration: formatDuration(performance.now() - start)
      });
    }
    const duration = performance.now() - start;
    const separated = arrivalTimes.length >= 3 && Math.max(...arrivalTimes) - Math.min(...arrivalTimes) >= 500;
    if (!separated) throw new Error("Response was buffered or fewer than 3 time-separated chunks arrived");
    setState("stream", "PASS", {
      chunks: String(lineCount), firstDelay: formatMs(firstDelay), duration: formatDuration(duration), error: "None"
    });
  } catch (error) {
    const reason = classifyError(error);
    setState("stream", "FAIL", {
      chunks: String(lineCount), firstDelay: formatMs(firstDelay), duration: formatDuration(performance.now() - start), error: reason
    }, reason);
  } finally {
    clearTimeout(timeoutTimer);
  }
}

function testWebSocket() {
  resetFields("websocket", ["sent", "received", "averageRtt", "duration", "closeCode", "closeReason", "error"]);
  return new Promise((resolve) => {
    const started = performance.now();
    const pending = new Map();
    const rtts = [];
    let socket;
    let sent = 0;
    let received = 0;
    let opened = false;
    let succeeded = false;
    let finished = false;
    let sendTimer;
    let durationTimer;

    const update = (extra = {}) => setState("websocket", "TESTING", {
      sent: String(sent),
      received: String(received),
      averageRtt: rtts.length ? formatMs(rtts.reduce((a, b) => a + b, 0) / rtts.length) : "—",
      duration: formatDuration(performance.now() - started),
      ...extra
    });

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      clearInterval(sendTimer);
      clearInterval(durationTimer);
    };

    const finish = (pass, reason, event = {}) => {
      if (finished) return;
      finished = true;
      cleanup();
      const closeCode = event.code === undefined ? "—" : String(event.code);
      const closeReason = event.reason || (pass ? "Normal closure" : "No reason provided");
      setState("websocket", pass ? "PASS" : "FAIL", {
        sent: String(sent), received: String(received),
        averageRtt: rtts.length ? formatMs(rtts.reduce((a, b) => a + b, 0) / rtts.length) : "—",
        duration: formatDuration(performance.now() - started),
        closeCode, closeReason,
        error: reason || "None"
      }, reason || "");
      resolve();
    };

    const sendProbe = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const message = `client-message-${sent + 1}-${Date.now()}`;
      pending.set(message, performance.now());
      sent += 1;
      socket.send(message);
      update();
    };

    const timeoutTimer = setTimeout(() => {
      try { socket?.close(4000, "Test timeout"); } catch { /* no open socket */ }
      finish(false, "Timeout");
    }, 38_000);

    try {
      socket = new WebSocket(websocketEndpoint("/ws"));
      socket.onopen = () => {
        opened = true;
        sendProbe();
        sendTimer = setInterval(sendProbe, 3_000);
        durationTimer = setInterval(() => update(), 1_000);
        setTimeout(() => {
          if (finished) return;
          succeeded = received >= 5 && socket.readyState === WebSocket.OPEN;
          if (succeeded) socket.close(1000, "Capability test complete");
          else {
            const reason = received < 5 ? "Fewer than 5 echo messages received" : "Connection did not survive 30 seconds";
            try { socket.close(4001, "Capability test failed"); } catch { /* handled below */ }
            finish(false, reason);
          }
        }, 30_000);
      };
      socket.onmessage = (event) => {
        const sentAt = pending.get(event.data);
        if (sentAt === undefined) return;
        pending.delete(event.data);
        received += 1;
        rtts.push(performance.now() - sentAt);
        update();
      };
      socket.onerror = () => update({ error: "WebSocket transport error" });
      socket.onclose = (event) => {
        if (succeeded && event.code === 1000) finish(true, "", event);
        else {
          const abnormal = event.code === 1006 ? "WebSocket closed abnormally (1006)" :
            opened ? `WebSocket closed unexpectedly (${event.code})` : "WebSocket handshake, CORS origin, DNS, or connection failure";
          finish(false, abnormal, event);
        }
      };
    } catch (error) {
      finish(false, classifyError(error, "websocket"));
    }
  });
}

const runners = { fetch: testFetch, sse: testSse, stream: testStream, websocket: testWebSocket };

async function runOne(key) {
  const button = document.querySelector(`[data-run="${key}"]`);
  if (state[key].status === "TESTING") return;
  button.disabled = true;
  lastTestTime = new Date();
  document.getElementById("test-time").textContent = `Last run: ${formatClock(lastTestTime)}`;
  try { await runners[key](); }
  finally { button.disabled = runningAll; }
}

async function runAll() {
  if (runningAll || Object.values(state).some((item) => item.status === "TESTING")) return;
  runningAll = true;
  const allButton = document.getElementById("run-all");
  const testButtons = [...document.querySelectorAll("[data-run]")];
  allButton.disabled = true;
  testButtons.forEach((button) => { button.disabled = true; });
  try {
    for (const key of Object.keys(TEST_NAMES)) await runOne(key);
  } finally {
    runningAll = false;
    allButton.disabled = false;
    testButtons.forEach((button) => { button.disabled = false; });
  }
}

function resultText() {
  const lines = [
    "Remote Capability Test",
    `Test Time: ${lastTestTime ? formatClock(lastTestTime) : "Not run"}`,
    "",
    "Page Load: PASS",
    "JavaScript: PASS",
    ""
  ];
  for (const [key, label] of Object.entries(TEST_NAMES)) {
    lines.push(`${label}: ${state[key].status}`);
    const fields = state[key].fields;
    if (key === "fetch") lines.push(`Latency: ${fields.latency || "—"}`, `HTTP Status: ${fields.httpStatus || "—"}`);
    if (key === "sse") lines.push(`Messages Received: ${fields.messages || "—"}`, `Connection Duration: ${fields.duration || "—"}`);
    if (key === "stream") lines.push(`Chunks Received: ${fields.chunks || "—"}`, `First Chunk Delay: ${fields.firstDelay || "—"}`, `Total Duration: ${fields.duration || "—"}`);
    if (key === "websocket") lines.push(
      `Messages Sent: ${fields.sent || "—"}`, `Messages Received: ${fields.received || "—"}`,
      `Average RTT: ${fields.averageRtt || "—"}`, `Connection Duration: ${fields.duration || "—"}`,
      `Close Code: ${fields.closeCode || "—"}`, `Close Reason: ${fields.closeReason || "—"}`
    );
    if (state[key].reason) lines.push(`Error: ${state[key].reason}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

async function copyResults() {
  const feedback = document.getElementById("copy-feedback");
  try {
    await navigator.clipboard.writeText(resultText());
    feedback.textContent = "Results copied.";
  } catch {
    const area = document.createElement("textarea");
    area.value = resultText();
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    feedback.textContent = copied ? "Results copied." : "Copy failed. Clipboard access is unavailable.";
  }
  setTimeout(() => { feedback.textContent = ""; }, 3000);
}

document.querySelectorAll("[data-run]").forEach((button) => {
  button.addEventListener("click", () => runOne(button.dataset.run));
});
document.getElementById("endpoint-form").addEventListener("submit", applyEndpoint);
document.getElementById("run-all").addEventListener("click", runAll);
document.getElementById("copy-results").addEventListener("click", copyResults);
initialiseEndpoint();
renderSummary();
