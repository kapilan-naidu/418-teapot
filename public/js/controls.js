// controls.js
// Generates a randomised control surface for each audience member
// Sends control values to server via ws-client.js send()

// ---------------------------------------------------------------------------
// SVG icons for shape triggers — thin stroked, geometric
// ---------------------------------------------------------------------------

const SHAPE_ICONS = {
  square: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="24" height="24"/>
  </svg>`,

  triangle: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
    <polygon points="20,6 34,34 6,34"/>
  </svg>`,

  circle: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="14"/>
  </svg>`,

  hexagon: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
    <polygon points="20,5 33,12.5 33,27.5 20,35 7,27.5 7,12.5"/>
  </svg>`,

  starburst: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
    <polygon points="20,4 23,15 34,15 25,22 28,34 20,27 12,34 15,22 6,15 17,15"/>
  </svg>`,

  cross: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
    <line x1="20" y1="6" x2="20" y2="34"/>
    <line x1="6" y1="20" x2="34" y2="20"/>
  </svg>`,
};

// ---------------------------------------------------------------------------
// Control pool definition
// ---------------------------------------------------------------------------

// Each entry describes one possible control slot
// type: slider | toggle | trigger | color | palette
// key:  used in WS message construction
// category: track | particle | shape | global

function buildPool() {
  const pool = [];

  // Track controls — 12 tracks × 3 types
  for (let t = 1; t <= 12; t++) {
    pool.push({ type: "slider", key: `gain_${t}`, category: "track", default: 0.7 });
    pool.push({ type: "toggle", key: `mute_${t}`, category: "track", default: false });
    pool.push({ type: "slider", key: `prob_${t}`, category: "track", default: 0.8 });
  }

  // Particle controls — 6 sliders
  const particleParams = ["count", "speed", "size", "spread", "opacity", "chaos"];
  for (const p of particleParams) {
    pool.push({
      type: "slider",
      key: `particle_${p}`,
      category: "particle",
      default: 0.5,
    });
  }

  // Shape triggers — 6 buttons
  const shapes = ["square", "triangle", "circle", "hexagon", "starburst", "cross"];
  for (const shape of shapes) {
    pool.push({ type: "trigger", key: `trigger_${shape}`, shape, category: "shape" });
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Random assignment
// ---------------------------------------------------------------------------

// Local state — mirrors what this client is currently sending
const localState = {
  gains: new Array(12).fill(0.7),
  mutes: new Array(12).fill(false),
  probs: new Array(12).fill(0.8),
};

// All rendered sliders — updated when color picker changes
const allSliders = [];
const allToggles = [];

function generateControls() {
  const surface = document.getElementById("control-surface");
  const pool = buildPool();

  // 30% chance of 4 controls, 70% chance of 6
  const slotCount = Math.random() < 0.3 ? 4 : 6;
  const hasCanvas = slotCount === 4;

  // ~10% chance of getting palette cycler (replaces one random slot)
  const hasPalette = Math.random() < 0.1;

  // Shuffle pool and pick slotCount unique entries
  const shuffled = shuffle([...pool]);
  const assigned = shuffled.slice(0, slotCount);

  // Inject palette cycler into a random slot if assigned
  if (hasPalette) {
    const idx = Math.floor(Math.random() * assigned.length);
    assigned[idx] = { type: "palette", key: "palette_cycle", category: "global" };
  }

  // Render controls into a 2-column grid
  // If no canvas, let grid grow to fill remaining space
  const grid = document.createElement("div");
  grid.className = "ctrl-grid";
  grid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    width: 100%;
    ${!hasCanvas ? "flex: 1;" : ""}
  `;

  for (const ctrl of assigned) {
    const cell = buildControl(ctrl, !hasCanvas);
    grid.appendChild(cell);
  }

  surface.appendChild(grid);

  // Color picker — always present, sits below the grid, full width
  const colorRow = buildColorPicker();
  surface.appendChild(colorRow);

  // Motif canvas — only for 4-control people
  if (hasCanvas) {
    const motifSection = buildMotifCanvas();
    surface.appendChild(motifSection);
  }
}

// ---------------------------------------------------------------------------
// Control builders
// ---------------------------------------------------------------------------

function buildControl(ctrl, expandCells = false) {
  const cell = document.createElement("div");
  cell.className = "ctrl-cell";
  cell.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 90px;
    ${expandCells ? "flex: 1;" : ""}
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 4px;
    padding: 12px;
    gap: 10px;
  `;

  switch (ctrl.type) {
    case "slider":
      buildSlider(cell, ctrl);
      break;
    case "toggle":
      buildToggle(cell, ctrl);
      break;
    case "trigger":
      buildTrigger(cell, ctrl);
      break;
    case "palette":
      buildPalette(cell, ctrl);
      break;
  }

  return cell;
}

// --- Slider ---
function buildSlider(cell, ctrl) {
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 1;
  slider.step = 0.01;
  slider.value = ctrl.default ?? 0.5;
  slider.style.cssText = `
    width: 100%;
    accent-color: var(--color-accent);
    cursor: pointer;
  `;

  // Debounced send — fires during drag but throttled to ~100ms
  // Handles mobile browsers where "change" on range is unreliable
  let debounceTimer;
  const onSliderChange = () => {
    applyParam(ctrl.key, parseFloat(slider.value));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sendParams, 100);
  };

  slider.addEventListener("input", onSliderChange);
  slider.addEventListener("change", onSliderChange); // catches release on desktop

  allSliders.push(slider);
  cell.appendChild(slider);
}

// --- Toggle (mute) ---
function buildToggle(cell, ctrl) {
  const btn = document.createElement("button");
  let active = ctrl.default ?? false;
  let currentAccent = "var(--color-accent)";

  const render = (accent = currentAccent) => {
    currentAccent = accent;
    btn.style.cssText = `
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 2px solid ${active ? accent : "rgba(255,255,255,0.2)"};
      background: ${active ? accent : "transparent"};
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    `;
  };

  render();

  btn.addEventListener("click", () => {
    active = !active;
    render();
    applyParam(ctrl.key, active);
    sendParams();
  });

  allToggles.push({ render });
  cell.appendChild(btn);
}

// --- Trigger (shape burst) ---
function buildTrigger(cell, ctrl) {
  const btn = document.createElement("button");
  btn.innerHTML = SHAPE_ICONS[ctrl.shape] || "";
  btn.style.cssText = `
    width: 64px;
    height: 64px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15); border-radius: 4px;
    color: var(--color-fg);
    cursor: pointer;
    padding: 12px;
    transition: border-color 0.1s, color 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Flash feedback on press
  btn.addEventListener("pointerdown", () => {
    btn.style.borderColor = "var(--color-accent)";
    btn.style.color = "var(--color-accent)";
  });
  btn.addEventListener("pointerup", () => {
    btn.style.borderColor = "rgba(255,255,255,0.15)";
    btn.style.color = "var(--color-fg)";
  });

  btn.addEventListener("click", () => {
    send({ type: "trigger", shape: ctrl.shape });
    // Vibrate on supported devices (Android Chrome)
    if (navigator.vibrate) navigator.vibrate(30);
  });

  cell.appendChild(btn);
}

// --- Palette cycler ---
function buildPalette(cell, ctrl) {
  // PALETTES from palettes.js — loaded before this file in play.html
  let current = 0;

  const btn = document.createElement("button");
  btn.style.cssText = `
    width: 100%;
    height: 64px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15); border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 12px;
    transition: border-color 0.15s;
  `;

  const renderSwatches = () => {
    btn.innerHTML = "";
    for (const col of PALETTES[current].colors) {
      const dot = document.createElement("span");
      dot.style.cssText = `
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: ${col};
        display: inline-block;
        flex-shrink: 0;
      `;
      btn.appendChild(dot);
    }
  };

  renderSwatches();

  btn.addEventListener("click", () => {
    current = (current + 1) % PALETTES.length;
    renderSwatches();
    send({ type: "palette", palette: current });
    if (navigator.vibrate) navigator.vibrate(40);
  });

  cell.appendChild(btn);
}

// --- Color picker ---
function buildColorPicker() {
  const INITIAL_COLOR = "#c0ff00";

  // Wrapper — full width, positioned for overlay label
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width: 100%;
    position: relative;
    height: 48px;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    flex-shrink: 0;
  `;

  // Native color input — invisible but full size, handles the picker dialog
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = INITIAL_COLOR;
  picker.style.cssText = `
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: none;
    padding: 0;
  `;

  // Colored background panel
  const bg = document.createElement("div");
  bg.style.cssText = `
    position: absolute;
    inset: 0;
    background: ${INITIAL_COLOR};
    transition: background 0.15s;
    pointer-events: none;
  `;

  // Hex label
  const label = document.createElement("span");
  label.textContent = INITIAL_COLOR.toUpperCase();
  label.style.cssText = `
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    letter-spacing: 0.1em;
    pointer-events: none;
    color: ${pickTextColor(INITIAL_COLOR)};
    transition: color 0.15s;
  `;

  wrapper.appendChild(bg);
  wrapper.appendChild(label);
  wrapper.appendChild(picker); // on top for click target

  picker.addEventListener("input", () => {
    const hex = picker.value;
    bg.style.background = hex;
    label.textContent = hex.toUpperCase();
    label.style.color = pickTextColor(hex);
    updateControlColors(hex);
  });

  picker.addEventListener("change", () => {
    send({ type: "color", color: picker.value });
  });

  return wrapper;
}

// Returns "#000000" or "#ffffff" based on perceived luminance of hex color
function pickTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#ffffff";
}

// Update all slider accent colors to match chosen color
// Falls back to default accent green if color is too dark to see on black bg
const SLIDER_COLOR_DEFAULT = "#c0ff00";
const SLIDER_BRIGHTNESS_MIN = 40; // 0-255 — below this, revert to default

function updateControlColors(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const accentColor = brightness < SLIDER_BRIGHTNESS_MIN ? SLIDER_COLOR_DEFAULT : hex;
  for (const slider of allSliders) {
    slider.style.accentColor = accentColor;
  }
  for (const toggle of allToggles) {
    toggle.render(accentColor);
  }
}

// ---------------------------------------------------------------------------
// Motif canvas
// ---------------------------------------------------------------------------

function buildMotifCanvas() {
  const section = document.createElement("div");
  section.style.cssText = `
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  `;

  // Canvas wrapper
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width: 100%;
    position: relative;
  `;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = `
    width: 100%;
    height: 280px;
    display: block;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08); border-radius: 4px;
    touch-action: none; border-radius: 4px;
    cursor: crosshair;
  `;

  // Placeholder text overlay
  const placeholder = document.createElement("div");
  placeholder.textContent = "draw a motif";
  placeholder.style.cssText = `
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.2);
    font-family: ui-monospace, monospace;
    font-size: 13px;
    pointer-events: none;
    letter-spacing: 0.1em;
  `;

  wrapper.appendChild(canvas);
  wrapper.appendChild(placeholder);

  // Send / clear button
  const sendBtn = document.createElement("button");
  sendBtn.textContent = "SPAWN MOTIF";
  sendBtn.style.cssText = `
    width: 100%;
    padding: 14px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.15); border-radius: 4px;
    color: var(--color-fg);
    font-family: ui-monospace, monospace;
    font-size: 13px;
    letter-spacing: 0.08em;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  `;

  sendBtn.addEventListener("pointerover", () => {
    sendBtn.style.borderColor = "var(--color-accent)";
    sendBtn.style.color = "var(--color-accent)";
  });
  sendBtn.addEventListener("pointerout", () => {
    sendBtn.style.borderColor = "rgba(255,255,255,0.15)";
    sendBtn.style.color = "var(--color-fg)";
  });

  section.appendChild(wrapper);
  section.appendChild(sendBtn);

  // --- Canvas drawing logic ---
  const ctx = canvas.getContext("2d");
  let points = []; // raw pixel points while drawing
  let drawing = false;
  let hasDrawn = false;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    redraw();
  }

  function redraw() {
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);
    if (points.length < 2) return;
    ctx.strokeStyle = "#c0ff00";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.stroke();
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return [src.clientX - rect.left, src.clientY - rect.top];
  }

  function onStart(e) {
    e.preventDefault();
    drawing = true;
    const pos = getPos(e);
    points = [pos];
    if (!hasDrawn) {
      hasDrawn = true;
      placeholder.style.display = "none";
    }
  }

  function onMove(e) {
    e.preventDefault();
    if (!drawing) return;
    const pos = getPos(e);
    // Only record point if moved enough (reduces point density)
    const last = points[points.length - 1];
    const dx = pos[0] - last[0];
    const dy = pos[1] - last[1];
    if (dx * dx + dy * dy > 16) {
      points.push(pos);
      redraw();
    }
  }

  function onEnd(e) {
    e.preventDefault();
    drawing = false;
  }

  canvas.addEventListener("pointerdown", onStart);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onEnd);
  canvas.addEventListener("pointercancel", onEnd);

  // Send button — normalise points, broadcast, clear
  sendBtn.addEventListener("click", () => {
    if (points.length < 2) return;

    const rect = canvas.getBoundingClientRect();
    const normalised = points.map(([x, y]) => [x / rect.width, y / rect.height]);

    send({ type: "motif", points: normalised, active: true });
    if (navigator.vibrate) navigator.vibrate([20, 30, 20]);

    // Clear canvas
    points = [];
    hasDrawn = false;
    placeholder.style.display = "flex";
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, w, h);
  });

  // Initial size
  requestAnimationFrame(resizeCanvas);
  window.addEventListener("resize", resizeCanvas);

  return section;
}

// ---------------------------------------------------------------------------
// Param application — writes into localState
// ---------------------------------------------------------------------------

function applyParam(key, value) {
  // Track gains: gain_1 ... gain_12
  const gainMatch = key.match(/^gain_(\d+)$/);
  if (gainMatch) {
    localState.gains[parseInt(gainMatch[1]) - 1] = value;
    return;
  }

  // Track mutes: mute_1 ... mute_12
  const muteMatch = key.match(/^mute_(\d+)$/);
  if (muteMatch) {
    localState.mutes[parseInt(muteMatch[1]) - 1] = value;
    return;
  }

  // Track probs: prob_1 ... prob_12
  const probMatch = key.match(/^prob_(\d+)$/);
  if (probMatch) {
    localState.probs[parseInt(probMatch[1]) - 1] = value;
    return;
  }

  // Particle params — stored flat on localState for sendParams()
  if (key.startsWith("particle_")) {
    localState[key] = value;
  }
}

// Build and send a full params message from localState
function sendParams() {
  const msg = {
    type: "params",
    gains: localState.gains,
    mutes: localState.mutes,
    probs: localState.probs,
  };

  // Attach any particle params that have been set
  const particleKeys = ["count", "speed", "size", "spread", "opacity", "chaos"];
  for (const pk of particleKeys) {
    const key = `particle_${pk}`;
    if (localState[key] !== undefined) msg[key] = localState[key];
  }

  send(msg);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
