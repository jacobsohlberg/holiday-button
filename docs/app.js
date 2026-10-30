const $ = (id) => document.getElementById(id);
const themes = {
  halloween: { occasion: "HALLOWEEN AT THE HOUSE", title: "Something’s\nstirring.", button: "Wake the ghosts", symbol: "✦" },
  thanksgiving: { occasion: "A MOMENT OF GRATITUDE", title: "A little\nthank you.", button: "Play a little gratitude", symbol: "❧" },
  christmas: { occasion: "CHRISTMAS AT THE HOUSE", title: "Hear a little\nChristmas.", button: "Let it ring", symbol: "✧" },
};
const api = (window.HOLIDAY_CONFIG?.apiBase || "").replace(/\/$/, "");
const configured = (/^https:\/\//.test(api) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(api)) && !api.includes("YOUR-");
let latestState = null, requestPending = false, ownJob = null, statusVersion = 0;
let cooldownEnd = 0, statusFetchedAt = 0;

function themeFor(state) {
  const name = Object.hasOwn(themes, state.season) ? state.season : "halloween";
  const theme = themes[name];
  document.body.dataset.season = name;
  $("occasion").textContent = theme.occasion;
  $("headline").replaceChildren(...theme.title.split("\n").flatMap((part, i) => i ? [document.createElement("br"), part] : [part]));
  $("symbol").textContent = theme.symbol;
  return theme;
}

function render() {
  if (!latestState) return;
  const state = latestState, theme = themeFor(state);
  const seconds = Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000));
  const stale = Date.now() - statusFetchedAt > 20_000;
  let label = theme.button, message = "Ready when you are.";
  if (requestPending) { label = "Sending…"; message = "Asking the show to start…"; }
  else if (!state.enabled) { label = "Back soon"; message = "The show is taking a break."; }
  else if (stale || !state.online || !state.ready) { label = "Back soon"; message = "The show is offline. Please try again later."; }
  else if (state.busy) {
    label = state.latest?.status === "playing" ? "Listen nearby…" : "One moment…";
    message = state.latest?.status === "playing" ? "The sound is playing. Enjoy!" : "The show is getting ready to play.";
  } else if (seconds) {
    label = `Ready again in ${seconds}s`;
    message = ownJob && state.latest?.id === ownJob && ["failed", "expired"].includes(state.latest.status)
      ? "That sound couldn’t start. Please try again after the pause."
      : "A short pause before the next little surprise.";
  }
  if ($("button-label").textContent !== label) $("button-label").textContent = label;
  if ($("status").textContent !== message) $("status").textContent = message;
  $("play").disabled = requestPending || stale || !state.enabled || !state.online || !state.ready || state.busy || seconds > 0;
}

function acceptState(state) {
  latestState = state;
  statusFetchedAt = Date.now();
  cooldownEnd = Date.now() + state.retryAfter * 1000;
  render();
}

async function call(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(api + path, { ...options, cache: "no-store", signal: controller.signal });
    const data = await response.json();
    if (!data.state) throw new Error("Unavailable");
    return { response, data };
  } finally { clearTimeout(timeout); }
}

async function refresh() {
  if (!configured || requestPending || document.hidden) return;
  const version = ++statusVersion;
  try {
    const { data } = await call("/api/status");
    if (version === statusVersion && !requestPending) acceptState(data.state);
  } catch {
    if (version !== statusVersion || requestPending) return;
    latestState = null;
    $("play").disabled = true;
    $("button-label").textContent = "Back soon";
    $("status").textContent = "We couldn’t reach the show. Trying again shortly…";
  }
}

$("play").addEventListener("click", async () => {
  if ($("play").disabled || requestPending) return;
  requestPending = true; ++statusVersion; render();
  try {
    const { data } = await call("/api/press", { method: "POST" });
    ownJob = data.jobId || ownJob;
    requestPending = false;
    acceptState(data.state);
  } catch {
    requestPending = false;
    latestState = null;
    $("play").disabled = true;
    $("button-label").textContent = "Checking…";
    $("status").textContent = "The connection was interrupted. Checking the show before trying again…";
  }
});

if (!configured) {
  $("button-label").textContent = "Coming soon";
  $("status").textContent = "A little seasonal surprise is on its way.";
} else {
  refresh();
  setInterval(refresh, 5000);
  setInterval(render, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}
