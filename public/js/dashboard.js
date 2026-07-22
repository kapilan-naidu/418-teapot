// dashboard.js — presenter status overlay panel
// An HTML panel showing live client count, active palette, particle levels,
// and a rolling event log. Toggled with 'd', but only ever shown on slide 6
// (index 5) — see setSlide(), called from slides.js. Fed by sketch.js's
// handleSketchMessage(), which calls dashboard.update(msg) for every
// incoming WS message.
//
// Requires PALETTES (palettes.js) — loaded before this file in index.html

const DASHBOARD_SLIDE_INDEX = 5; // slide 6
const DASHBOARD_MAX_LOG = 5;

// Particle param key -> display label, in panel order
const DASHBOARD_BARS = [
  { param: "count", label: "density" },
  { param: "speed", label: "speed" },
  { param: "size", label: "size" },
  { param: "opacity", label: "opacity" },
  { param: "spread", label: "drift" },
  { param: "chaos", label: "chaos" },
];

let panelEl, clientsEl, paletteNameEl, swatchesEl, logEl;
const barFills = {};

let visible = true; // user's 'd'-key preference
// slides.js's `current` is a global — read it directly in case we're loading
// straight into slide 6 via a #slide-6 URL hash, before any goTo() call fires
let onDashboardSlide = typeof current !== "undefined" && current === DASHBOARD_SLIDE_INDEX;
let logEntries = [];
let currentPalette = PALETTES[0];

function buildDashboardPanel() {
  panelEl = document.createElement("div");
  panelEl.id = "dashboard-panel";

  const clientsRow = document.createElement("div");
  clientsRow.className = "dash-row";
  clientsEl = document.createElement("span");
  clientsEl.className = "dash-clients";
  clientsEl.textContent = "Clients: 0";
  clientsRow.appendChild(clientsEl);
  panelEl.appendChild(clientsRow);

  const paletteRow = document.createElement("div");
  paletteRow.className = "dash-row dash-palette";
  paletteNameEl = document.createElement("span");
  paletteNameEl.className = "dash-palette-name";
  swatchesEl = document.createElement("span");
  swatchesEl.className = "dash-swatches";
  paletteRow.appendChild(paletteNameEl);
  paletteRow.appendChild(swatchesEl);
  panelEl.appendChild(paletteRow);

  panelEl.appendChild(divider());

  const barsEl = document.createElement("div");
  barsEl.className = "dash-bars";
  for (const { param, label } of DASHBOARD_BARS) {
    const row = document.createElement("div");
    row.className = "dash-bar-row";

    const labelEl = document.createElement("span");
    labelEl.className = "dash-bar-label";
    labelEl.textContent = label;

    const track = document.createElement("div");
    track.className = "dash-bar-track";
    const fill = document.createElement("div");
    fill.className = "dash-bar-fill";
    track.appendChild(fill);
    barFills[param] = fill;

    row.appendChild(labelEl);
    row.appendChild(track);
    barsEl.appendChild(row);
  }
  panelEl.appendChild(barsEl);

  panelEl.appendChild(divider());

  logEl = document.createElement("div");
  logEl.className = "dash-log";
  panelEl.appendChild(logEl);

  const hint = document.createElement("div");
  hint.className = "dash-hint";
  hint.textContent = "[d] toggle dashboard";
  panelEl.appendChild(hint);

  document.body.appendChild(panelEl);
  applyVisibility();

  // Match sketch.js's default activePalette (0) until the first palette event
  renderPalette(PALETTES[0]);
}

// Panel only ever shows on slide 6, and only if the 'd' toggle is also on
function applyVisibility() {
  panelEl.classList.toggle("visible", visible && onDashboardSlide);
}

// Called from slides.js's goTo() on every navigation
function setSlide(index) {
  onDashboardSlide = index === DASHBOARD_SLIDE_INDEX;
  applyVisibility();
}

function divider() {
  const el = document.createElement("div");
  el.className = "dash-divider";
  return el;
}

function renderPalette(palette) {
  currentPalette = palette;

  paletteNameEl.textContent = palette.name;
  swatchesEl.innerHTML = "";
  for (const col of palette.colors) {
    const dot = document.createElement("span");
    dot.className = "dash-swatch";
    dot.style.background = col;
    swatchesEl.appendChild(dot);
  }

  // Keep the particle bars in the current palette's lead colour
  for (const { param } of DASHBOARD_BARS) {
    if (barFills[param]) barFills[param].style.background = palette.colors[0];
  }
}

// Chat-style log — oldest at top, newest at bottom, newest highlighted in
// the current palette's lead colour, everything else muted grey
function pushLog(entry) {
  logEntries.push(entry);
  if (logEntries.length > DASHBOARD_MAX_LOG) logEntries.shift();

  logEl.innerHTML = "";
  logEntries.forEach((line, i) => {
    const div = document.createElement("div");
    div.textContent = line;
    div.style.color =
      i === logEntries.length - 1 ? currentPalette.colors[0] : "rgba(255,255,255,0.85)";
    logEl.appendChild(div);
  });
}

function update(msg) {
  switch (msg.type) {
    case "state": {
      if (typeof msg.clientCount === "number") {
        clientsEl.textContent = `Clients: ${msg.clientCount}`;
      }

      if (msg.particles) {
        for (const { param } of DASHBOARD_BARS) {
          const v = msg.particles[param];
          if (typeof v === "number" && barFills[param]) {
            barFills[param].style.width = `${Math.round(v * 100)}%`;
          }
        }
      }
      break;
    }

    case "palette": {
      const palette = PALETTES[msg.palette % PALETTES.length];
      renderPalette(palette);
      pushLog(`◈ palette → ${palette.name}`);
      break;
    }

    case "trigger": {
      pushLog(`▶ trigger: ${msg.shape}`);
      break;
    }

    case "motif": {
      if (msg.active) pushLog(`✎ motif from ${msg.senderId?.slice(0, 6)}`);
      break;
    }

    case "presence": {
      const shortId = msg.clientId?.slice(0, 6) ?? "?";
      const joined = msg.event === "join";
      pushLog(`${joined ? "+" : "-"} ${shortId} ${joined ? "connected" : "disconnected"}`);
      break;
    }
  }
}

function toggleDashboard() {
  visible = !visible;
  applyVisibility();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "D") toggleDashboard();
});

buildDashboardPanel();

const dashboard = { update, setSlide };
