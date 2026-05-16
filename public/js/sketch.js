// sketch.js — main p5 sketch for 418: I'm a Teapot
// Driven by WebSocket aggregate state from server.js
// Lifecycle: sketchPrewarm() on slide 5, sketchStart() on slide 6

// ---------------------------------------------------------------------------
// Global tuning knobs — edit freely
// ---------------------------------------------------------------------------

const CFG = {
  // Particles
  PARTICLE_COUNT_DEFAULT: 100, // base particle count
  PARTICLE_SPEED_DEFAULT: 0.4, // 0–1 normalised speed
  PARTICLE_SIZE_DEFAULT: 0.4, // 0–1 normalised size
  PARTICLE_SPREAD_DEFAULT: 0.5,
  PARTICLE_OPACITY_DEFAULT: 0.5,
  PARTICLE_CHAOS_DEFAULT: 0.3, // jitter / random walk intensity

  PARTICLE_SIZE_MIN: 1, // px
  PARTICLE_SIZE_MAX: 6, // px
  PARTICLE_SPEED_MIN: 0.05,
  PARTICLE_SPEED_MAX: 1.8,
  PARTICLE_MAX_COUNT: 600,

  // Shape triggers
  SHAPE_LIFESPAN_MIN: 1000, // ms
  SHAPE_LIFESPAN_MAX: 5000, // ms
  SHAPE_LONG_LIFE_CHANCE: 0.12, // probability of 3× lifespan
  SHAPE_LONG_LIFE_MULT: 3,
  SHAPE_SIZE_MIN: 50, // px
  SHAPE_SIZE_MAX: 250, // px
  SHAPE_STROKE_WEIGHT: 1.5,

  // Motifs
  MOTIF_LIFESPAN_MIN: 3000, // ms
  MOTIF_LIFESPAN_MAX: 9000, // ms
  MOTIF_STROKE_WEIGHT: 1.2,

  // Dashboard
  DASHBOARD_FONT_SIZE: 14, // px
  DASHBOARD_MAX_MESSAGES: 8,
  DASHBOARD_BG_ALPHA: 0.8, // 0–1

  // Lerp smoothing for incoming aggregate params (per frame)
  LERP_SPEED: 0.05,
};

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const PALETTES = [
  { name: "Void", colors: ["#c0ff00", "#ffffff", "#444444", "#cc3333", "#1a8c00"] },
  { name: "Ember", colors: ["#ff4400", "#ff9900", "#ffeecc", "#cc0044", "#ffcc00"] },
  { name: "Cryo", colors: ["#00ccff", "#0099dd", "#e8f8ff", "#aaeeff", "#0066aa"] },
  { name: "Acid", colors: ["#ff00ff", "#00ff88", "#ffff00", "#ff0088", "#00ffff"] },
  { name: "Dusk", colors: ["#cc88ff", "#ff88aa", "#ffd4a0", "#9944dd", "#6633aa"] },
];

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

// Target params — written by WS messages, lerped toward by draw()
const target = {
  particleCount: CFG.PARTICLE_COUNT_DEFAULT,
  particleSpeed: CFG.PARTICLE_SPEED_DEFAULT,
  particleSize: CFG.PARTICLE_SIZE_DEFAULT,
  particleSpread: CFG.PARTICLE_SPREAD_DEFAULT,
  particleOpacity: CFG.PARTICLE_OPACITY_DEFAULT,
  particleChaos: CFG.PARTICLE_CHAOS_DEFAULT,
};

// Displayed params — smoothly lerped toward target
const live = { ...target };

let particles = [];
let shapeEvents = []; // active shape trigger animations
let motifEvents = []; // active motif animations
let clientColors = {}; // senderId -> p5 color string

let activePalette = 0; // index into PALETTES

let isRunning = false;
let isWarmed = false;

// Dashboard
let showDashboard = true;
let connectedCount = 0;
let recentMessages = []; // string[]

// ---------------------------------------------------------------------------
// Sketch lifecycle (called by slides.js)
// ---------------------------------------------------------------------------

function sketchPrewarm() {
  if (isWarmed) return;
  isWarmed = true;
  buildParticles(CFG.PARTICLE_COUNT_DEFAULT);
}

function sketchStart() {
  isRunning = true;
  if (!isWarmed) sketchPrewarm();
}

function sketchPause() {
  isRunning = false;
}

// ---------------------------------------------------------------------------
// p5 setup / draw
// ---------------------------------------------------------------------------

function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("sketch-container");
  noCursor();
  colorMode(RGB, 255, 255, 255, 1);
  frameRate(60);
}

function draw() {
  if (!isWarmed) {
    background(0);
    return;
  }

  // Fade rather than clear — motion trail effect
  background(0, 0, 0, 0.18);

  if (!isRunning) return;

  // Smooth params toward targets
  lerpParams();

  // Sync particle pool size to live count
  syncParticleCount();

  // Draw layers
  drawParticles();
  drawMotifs();
  drawShapes();

  if (showDashboard) drawDashboard();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ---------------------------------------------------------------------------
// Param lerp
// ---------------------------------------------------------------------------

function lerpParams() {
  const k = CFG.LERP_SPEED;
  for (const key of Object.keys(live)) {
    live[key] += (target[key] - live[key]) * k;
  }
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

function buildParticles(count) {
  particles = [];
  for (let i = 0; i < count; i++) {
    particles.push(makeParticle());
  }
}

function makeParticle() {
  return {
    x: random(width),
    y: random(height),
    vx: random(-1, 1),
    vy: random(-1, 1),
    size: random(CFG.PARTICLE_SIZE_MIN, CFG.PARTICLE_SIZE_MAX),
    // Each particle picks a random color from current palette
    colorIndex: floor(random(PALETTES[activePalette].colors.length)),
    noiseOffset: random(1000),
  };
}

function syncParticleCount() {
  const desired = floor(map(live.particleCount, 0, 1, 0, CFG.PARTICLE_MAX_COUNT));
  while (particles.length < desired) particles.push(makeParticle());
  if (particles.length > desired) particles.splice(desired);
}

function drawParticles() {
  const spd = map(
    live.particleSpeed,
    0,
    1,
    CFG.PARTICLE_SPEED_MIN,
    CFG.PARTICLE_SPEED_MAX
  );
  const sz = map(live.particleSize, 0, 1, CFG.PARTICLE_SIZE_MIN, CFG.PARTICLE_SIZE_MAX);
  const alpha = map(live.particleOpacity, 0, 1, 0.05, 0.9);
  const chaos = map(live.particleChaos, 0, 1, 0, 0.08);
  const spread = map(live.particleSpread, 0, 1, 0.2, 1.0);

  noStroke();

  for (const p of particles) {
    // Noise-based drift with chaos jitter
    const angle = noise(p.x * 0.003, p.y * 0.003, p.noiseOffset) * TWO_PI * 2;
    p.vx += cos(angle) * spread * 0.5 + random(-chaos, chaos);
    p.vy += sin(angle) * spread * 0.5 + random(-chaos, chaos);

    // Clamp velocity
    const mag = sqrt(p.vx * p.vx + p.vy * p.vy);
    if (mag > spd) {
      p.vx = (p.vx / mag) * spd;
      p.vy = (p.vy / mag) * spd;
    }

    p.x += p.vx;
    p.y += p.vy;
    p.noiseOffset += 0.002;

    // Wrap edges
    if (p.x < 0) p.x = width;
    if (p.x > width) p.x = 0;
    if (p.y < 0) p.y = height;
    if (p.y > height) p.y = 0;

    const col = color(PALETTES[activePalette].colors[p.colorIndex] || "#ffffff");
    col.setAlpha(alpha);
    fill(col);
    ellipse(p.x, p.y, sz * (p.size / CFG.PARTICLE_SIZE_MAX));
  }
}

// ---------------------------------------------------------------------------
// Shape triggers
// ---------------------------------------------------------------------------

// Shapes available for triggers
const SHAPE_RENDERERS = {
  square: drawSquare,
  triangle: drawTriangle,
  circle: drawCircle,
  hexagon: drawHexagon,
  starburst: drawStarburst,
  cross: drawCross,
};

function spawnShape(shapeName, senderId) {
  const palette = PALETTES[activePalette];
  const col =
    clientColors[senderId] || palette.colors[floor(random(palette.colors.length))];

  // Occasionally give a shape 3× longer life
  const longLife = random() < CFG.SHAPE_LONG_LIFE_CHANCE;
  const baseLife = random(CFG.SHAPE_LIFESPAN_MIN, CFG.SHAPE_LIFESPAN_MAX);
  const lifespan = longLife ? baseLife * CFG.SHAPE_LONG_LIFE_MULT : baseLife;

  shapeEvents.push({
    shape: shapeName,
    x: random(width * 0.1, width * 0.9),
    y: random(height * 0.1, height * 0.9),
    size: random(CFG.SHAPE_SIZE_MIN, CFG.SHAPE_SIZE_MAX),
    rotation: random(TWO_PI),
    rotSpeed: random(0.004, 0.02) * (random() < 0.5 ? 1 : -1), // random direction
    color: col,
    born: millis(),
    lifespan,
  });
}

function drawShapes() {
  const now = millis();

  shapeEvents = shapeEvents.filter((s) => now - s.born < s.lifespan);

  for (const s of shapeEvents) {
    const elapsed = now - s.born;
    const progress = elapsed / s.lifespan; // 0 → 1

    // Scale: quick bloom in, slow fade out
    const scaleT = progress < 0.15 ? easeOutCubic(progress / 0.15) : 1;

    // Alpha: full until 60%, then fade
    const alpha = progress < 0.6 ? 1 : map(progress, 0.6, 1, 1, 0);

    const col = color(s.color);
    col.setAlpha(alpha);

    push();
    translate(s.x, s.y);
    s.rotation += s.rotSpeed;
    rotate(s.rotation);
    scale(scaleT);

    noFill();
    stroke(col);
    strokeWeight(CFG.SHAPE_STROKE_WEIGHT);

    const renderer = SHAPE_RENDERERS[s.shape];
    if (renderer) renderer(s.size);

    pop();
  }
}

// Primitive renderers — all rotationally symmetric, centered at origin
function drawSquare(sz) {
  rectMode(CENTER);
  square(0, 0, sz);
}

function drawTriangle(sz) {
  const r = sz / 2;
  polygon(0, 0, r, 3);
}

function drawCircle(sz) {
  ellipse(0, 0, sz, sz);
}

function drawHexagon(sz) {
  polygon(0, 0, sz / 2, 6);
}

function drawStarburst(sz) {
  const outer = sz / 2;
  const inner = outer * 0.45;
  const pts = 8;
  beginShape();
  for (let i = 0; i < pts * 2; i++) {
    const angle = (PI / pts) * i - HALF_PI;
    const r = i % 2 === 0 ? outer : inner;
    vertex(cos(angle) * r, sin(angle) * r);
  }
  endShape(CLOSE);
}

function drawCross(sz) {
  const arm = sz / 2;
  const w = sz * 0.18;
  rectMode(CENTER);
  rect(0, 0, arm * 2, w);
  rect(0, 0, w, arm * 2);
}

// Regular polygon helper
function polygon(x, y, radius, sides) {
  const angle = TWO_PI / sides;
  beginShape();
  for (let i = 0; i < sides; i++) {
    const a = angle * i - HALF_PI;
    vertex(x + cos(a) * radius, y + sin(a) * radius);
  }
  endShape(CLOSE);
}

// Easing
function easeOutCubic(t) {
  return 1 - pow(1 - t, 3);
}

// ---------------------------------------------------------------------------
// Motifs
// ---------------------------------------------------------------------------

function spawnMotif(points, senderId) {
  if (!points || points.length < 2) return;

  const palette = PALETTES[activePalette];
  const col =
    clientColors[senderId] || palette.colors[floor(random(palette.colors.length))];

  const lifespan = random(CFG.MOTIF_LIFESPAN_MIN, CFG.MOTIF_LIFESPAN_MAX);

  // Points arrive normalised 0–1; map to canvas on spawn
  const scale = random(0.1, 0.4);
  const mapped = points.map(([nx, ny]) => [nx * width * scale, ny * height * scale]);

  motifEvents.push({
    points: mapped,
    color: col,
    born: millis(),
    lifespan,
    x: random(width * 0.1, width * 0.9),
    y: random(height * 0.1, height * 0.9),
    rotation: random(TWO_PI),
    rotSpeed: random(0.002, 0.008) * (random() < 0.5 ? 1 : -1),
  });
}

function drawMotifs() {
  const now = millis();
  motifEvents = motifEvents.filter((m) => now - m.born < m.lifespan);

  for (const m of motifEvents) {
    const progress = (now - m.born) / m.lifespan;
    const alpha = progress < 0.7 ? 1 : map(progress, 0.7, 1, 1, 0);

    const col = color(m.color);
    col.setAlpha(alpha);

    push();
    // Centre motif on its spawn point
    const cx = m.points.reduce((s, p) => s + p[0], 0) / m.points.length;
    const cy = m.points.reduce((s, p) => s + p[1], 0) / m.points.length;

    translate(m.x, m.y);
    m.rotation += m.rotSpeed;
    rotate(m.rotation);

    noFill();
    stroke(col);
    strokeWeight(CFG.MOTIF_STROKE_WEIGHT);

    beginShape();
    for (const [px, py] of m.points) {
      vertex(px - cx, py - cy);
    }
    endShape();
    pop();
  }
}

// ---------------------------------------------------------------------------
// Dashboard overlay
// ---------------------------------------------------------------------------

function drawDashboard() {
  const fs = CFG.DASHBOARD_FONT_SIZE;
  const pad = 10;
  const lh = fs + 4;
  const lines = [
    `clients: ${connectedCount - 1}`,
    `shapes:  ${shapeEvents.length}`,
    `motifs:  ${motifEvents.length}`,
    `palette: ${PALETTES[activePalette].name}`,
    `───────────────`,
    ...recentMessages,
    `───────────────`,
    `[d] toggle dashboard`,
  ];

  const w = 220;
  const h = lines.length * lh + pad * 2;
  const x = pad;
  const y = height - h - pad;

  // Background
  noStroke();
  fill(0, 0, 0, CFG.DASHBOARD_BG_ALPHA);
  rect(x, y, w, h, 3);

  // Text
  textFont("monospace");
  textSize(fs);
  noStroke();

  lines.forEach((line, i) => {
    const isRecent = i >= 5 && i < 5 + recentMessages.length;
    fill(isRecent ? color(PALETTES[activePalette].colors[0]) : color("#888888"));
    text(line, x + pad, y + pad + lh * i + fs);
  });
}

// ---------------------------------------------------------------------------
// WS message ingestion — called by ws-client.js onMessage handler
// ---------------------------------------------------------------------------

function handleSketchMessage(msg) {
  // Log to dashboard (recent messages)
  logMessage(msg);

  switch (msg.type) {
    case "hello":
      // Server confirms our connection — nothing to do in sketch
      break;

    // Aggregate state tick from server
    case "state": {
      connectedCount = msg.clientCount ?? connectedCount;

      // Map server 0–1 values to target params
      if (msg.particles) {
        target.particleCount = msg.particles.count ?? target.particleCount;
        target.particleSpeed = msg.particles.speed ?? target.particleSpeed;
        target.particleSize = msg.particles.size ?? target.particleSize;
        target.particleSpread = msg.particles.spread ?? target.particleSpread;
        target.particleOpacity = msg.particles.opacity ?? target.particleOpacity;
        target.particleChaos = msg.particles.chaos ?? target.particleChaos;
      }
      // gains / mutes / probs forwarded to WebMIDI bridge (index.html handles it)
      break;
    }

    case "trigger":
      spawnShape(msg.shape, msg.senderId);
      break;

    case "motif":
      if (msg.active && msg.points) spawnMotif(msg.points, msg.senderId);
      break;

    // One-time palette reset — recolour all particles
    case "palette": {
      activePalette = msg.palette % PALETTES.length;
      // Reassign particle colors to new palette
      for (const p of particles) {
        p.colorIndex = floor(random(PALETTES[activePalette].colors.length));
      }
      break;
    }

    case "color":
      clientColors[msg.senderId] = msg.color;
      break;
  }
}

// Keep a short rolling log of human-readable message summaries
function logMessage(msg) {
  let label;
  switch (msg.type) {
    case "state":
      return; // too frequent — skip
    case "trigger":
      label = `▶ trigger: ${msg.shape}`;
      break;
    case "motif":
      label = `✎ motif from ${msg.senderId?.slice(0, 6)}`;
      break;
    case "palette":
      label = `◈ palette → ${PALETTES[msg.palette]?.name}`;
      break;
    case "color":
      label = `● color from ${msg.senderId?.slice(0, 6)}`;
      break;
    default:
      label = `? ${msg.type}`;
  }
  recentMessages.unshift(label);
  if (recentMessages.length > CFG.DASHBOARD_MAX_MESSAGES) {
    recentMessages.pop();
  }
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

function keyPressed() {
  if (key === "d" || key === "D") showDashboard = !showDashboard;
}
