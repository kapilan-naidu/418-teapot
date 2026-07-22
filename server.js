// server.js
// Express + WebSocket server for 418: I'm a Teapot
// Aggregates client control state and broadcasts it to all connected peers

const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

// Serve /public as static root
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/play", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "play.html"));
});

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const TRACK_COUNT = 12;
const TICK_MS = 50; // aggregate broadcast interval

// Per-client state. Keyed by a generated client ID.
// Each entry holds whatever params that client has sent.
const clientStates = new Map(); // clientId -> { gains, mutes, probs, particles }

// Map ws -> clientId for lookup on message/close
const wsToId = new Map();

let clientCounter = 0;

function makeClientId() {
  return `c${++clientCounter}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Exponential-weighted average across all clients that have a value for key.
 * weight = v² so extreme values pull harder than mid-range ones.
 * Falls back to plain mean if all values are zero.
 *
 * @param {string} key       top-level key in clientStates entry
 * @param {number} index     array index within that key (or undefined for scalar)
 * @param {number} fallback  value to use when no clients have data
 */
function expWeightedAvg(key, index, fallback = 0.5) {
  const values = [];

  for (const state of clientStates.values()) {
    const field = state[key];
    if (field === undefined) continue;
    const v = index !== undefined ? field[index] : field;
    if (typeof v === "number") values.push(v);
  }

  if (values.length === 0) return fallback;

  const sumWeightedValues = values.reduce((acc, v) => acc + v * v * v, 0);
  const sumWeights = values.reduce((acc, v) => acc + v * v, 0);

  if (sumWeights === 0) {
    // All zero — plain mean
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  return sumWeightedValues / sumWeights;
}

/**
 * Majority vote for boolean/mute values.
 * Returns true if more than half of clients with data have it set.
 */
function majorityVote(key, index) {
  let trueCount = 0;
  let total = 0;

  for (const state of clientStates.values()) {
    const field = state[key];
    if (field === undefined) continue;
    const v = index !== undefined ? field[index] : field;
    if (typeof v === "boolean") {
      total++;
      if (v) trueCount++;
    }
  }

  if (total === 0) return false;
  return trueCount / total > 0.5;
}

/**
 * Build the full aggregate state object to broadcast on every tick.
 */
function buildAggregateState() {
  const gains = [];
  const mutes = [];
  const probs = [];

  for (let i = 0; i < TRACK_COUNT; i++) {
    gains.push(expWeightedAvg("gains", i, 0.7));
    mutes.push(majorityVote("mutes", i));
    probs.push(expWeightedAvg("probs", i, 0.8));
  }

  const PARTICLE_KEYS = ["count", "speed", "size", "spread", "opacity", "chaos"];
  const particles = {};
  for (const pk of PARTICLE_KEYS) {
    particles[pk] = expWeightedAvg(`particle_${pk}`, undefined, 0.5);
  }

  return {
    type: "state",
    gains,
    mutes,
    probs,
    particles,
    clientCount: clientStates.size,
  };
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

function broadcast(data, excludeWs = null) {
  const msg = JSON.stringify(data);
  for (const ws of wss.clients) {
    if (ws !== excludeWs && ws.readyState === 1) {
      ws.send(msg);
    }
  }
}

function broadcastAll(data) {
  broadcast(data, null);
}

// ---------------------------------------------------------------------------
// Aggregate tick
// ---------------------------------------------------------------------------

setInterval(() => {
  if (clientStates.size === 0) return;
  const state = buildAggregateState();
  broadcastAll(state);
}, TICK_MS);

// ---------------------------------------------------------------------------
// WebSocket connection handling
// ---------------------------------------------------------------------------

wss.on("connection", (ws) => {
  const clientId = makeClientId();
  wsToId.set(ws, clientId);
  clientStates.set(clientId, {
    gains: new Array(TRACK_COUNT).fill(0.7),
    mutes: new Array(TRACK_COUNT).fill(false),
    probs: new Array(12).fill(0.8),
  });

  console.log(`[+] ${clientId} connected. Total: ${clientStates.size}`);

  // Send the client their ID so they can tag outgoing messages
  ws.send(JSON.stringify({ type: "hello", clientId }));

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      console.warn("[ws] non-JSON message ignored");
      return;
    }

    const id = wsToId.get(ws);

    switch (msg.type) {
      // --- Continuous param updates from a client ---
      case "params": {
        const state = clientStates.get(id);
        if (!state) break;

        // Merge whatever params the client sent into their state entry.
        // Client sends: { type:"params", gains?:[], mutes?:[], probs?:[], particle_count?:n, ... }
        if (Array.isArray(msg.gains)) state.gains = msg.gains.map(clamp01);
        if (Array.isArray(msg.mutes)) state.mutes = msg.mutes.map(Boolean);
        if (Array.isArray(msg.probs)) state.probs = msg.probs.map(clamp01);

        const PARTICLE_KEYS = ["count", "speed", "size", "spread", "opacity", "chaos"];
        for (const pk of PARTICLE_KEYS) {
          const key = `particle_${pk}`;
          if (typeof msg[key] === "number") state[key] = clamp01(msg[key]);
        }
        break;
      }

      // --- Trigger: shape burst — immediate broadcast to everyone ---
      case "trigger": {
        // { type:"trigger", shape:"square"|"triangle"|"circle"|"hexagon"|"starburst"|"cross", senderId }
        broadcastAll({ ...msg, senderId: id });
        break;
      }

      // --- Motif: user-drawn polyline — immediate broadcast ---
      case "motif": {
        // { type:"motif", points:[[x,y],...], active:bool }
        broadcastAll({ ...msg, senderId: id });
        break;
      }

      // --- Palette: one-time global reset event ---
      case "palette": {
        // { type:"palette", palette: 0-4 }
        broadcastAll({ ...msg, senderId: id });
        break;
      }

      // --- Individual color: pass through to presenter sketch only ---
      case "color": {
        // { type:"color", color:"#rrggbb" }
        broadcast({ ...msg, senderId: id }, ws);
        break;
      }

      default:
        console.warn("[ws] unknown message type:", msg.type);
    }
  });

  ws.on("close", () => {
    const id = wsToId.get(ws);
    clientStates.delete(id);
    wsToId.delete(ws);
    console.log(`[-] ${id} disconnected. Total: ${clientStates.size}`);
  });

  ws.on("error", (err) => {
    console.error("[ws] error:", err);
  });
});

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`\n418: I'm a teapot — server running`);
  console.log(`  Presenter : http://localhost:${PORT}/`);
  console.log(`  Audience  : http://localhost:${PORT}/play\n`);
});
