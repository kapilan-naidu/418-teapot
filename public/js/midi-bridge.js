// midi-bridge.js
// Bridges incoming WebSocket state to WebMIDI output
// Requires WebMIDI.js (IIFE build) loaded before this file
//
// Channel 1 CC  — track gains (CC 1–12), probs (CC 13–24), mutes (CC 25–36)
// Channel 2 Note-on — shape triggers, one note per shape, velocity 127

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MIDI_CFG = {
  // Name of the IAC port to send to — match exactly what shows in Audio MIDI Setup
  OUTPUT_PORT_NAME: "IAC Driver Bus 1",

  CH_PARAMS: 1, // MIDI channel for CC messages (1-indexed)
  CH_TRIGGERS: 2, // MIDI channel for note-on trigger messages

  // CC base offsets
  CC_GAIN_BASE: 1, // CC 1–12  → track gains
  CC_PROB_BASE: 13, // CC 13–24 → track probs
  CC_MUTE_BASE: 25, // CC 25–36 → track mutes (0 = unmuted, 127 = muted)

  NOTE_OFF_DELAY_MS: 100, // ms before sending note-off after note-on
};

// Shape → MIDI note mapping (channel 2)
const SHAPE_NOTES = {
  square: 60, // C4
  triangle: 62, // D4
  circle: 64, // E4
  hexagon: 65, // F4
  starburst: 67, // G4
  cross: 69, // A4
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let midiOutput = null;
let midiReady = false;

// Local mute state per track — used to gate gain CCs
const muteState = new Array(12).fill(false);

// Last known gain per track — sent immediately on unmute
const gainState = new Array(12).fill(0.7);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initMidi() {
  if (typeof WebMidi === "undefined") {
    console.warn("[midi] WebMidi.js not loaded");
    return;
  }

  WebMidi.enable((err) => {
    if (err) {
      console.error("[midi] WebMidi enable failed:", err);
      return;
    }

    midiOutput = WebMidi.getOutputByName(MIDI_CFG.OUTPUT_PORT_NAME);

    if (!midiOutput) {
      console.warn(`[midi] Output "${MIDI_CFG.OUTPUT_PORT_NAME}" not found.`);
      console.warn(
        "[midi] Available outputs:",
        WebMidi.outputs.map((o) => o.name)
      );
      return;
    }

    midiReady = true;
    console.log(`[midi] Connected to "${MIDI_CFG.OUTPUT_PORT_NAME}"`);
  });
}

// ---------------------------------------------------------------------------
// Message handler — called from handleSketchMessage in sketch.js
// ---------------------------------------------------------------------------

function handleMidiMessage(msg) {
  if (!midiReady) return;

  switch (msg.type) {
    case "state":
      processMidiState(msg);
      break;

    case "trigger":
      processMidiTrigger(msg.shape);
      break;
  }
}

// ---------------------------------------------------------------------------
// State → CC
// ---------------------------------------------------------------------------

function processMidiState(msg) {
  const ch = MIDI_CFG.CH_PARAMS;

  // --- Mutes (CC 25–36) ---
  // Process mutes first so muteState is fresh when we gate gains below
  if (Array.isArray(msg.mutes)) {
    msg.mutes.forEach((muted, i) => {
      const wasMuted = muteState[i];
      muteState[i] = muted;

      const cc = MIDI_CFG.CC_MUTE_BASE + i;
      const val = muted ? 127 : 0;
      sendCC(ch, cc, val);

      // Track just unmuted — send its current gain immediately
      if (wasMuted && !muted) {
        const gainCC = MIDI_CFG.CC_GAIN_BASE + i;
        const gainVal = to127(gainState[i]);
        sendCC(ch, gainCC, gainVal);
      }
    });
  }

  // --- Gains (CC 1–12) — gated by mute state ---
  if (Array.isArray(msg.gains)) {
    msg.gains.forEach((gain, i) => {
      gainState[i] = gain; // always update internal state
      if (muteState[i]) return; // suppress CC while muted
      sendCC(ch, MIDI_CFG.CC_GAIN_BASE + i, to127(gain));
    });
  }

  // --- Probs (CC 13–24) — no gating needed ---
  if (Array.isArray(msg.probs)) {
    msg.probs.forEach((prob, i) => {
      sendCC(ch, MIDI_CFG.CC_PROB_BASE + i, to127(prob));
    });
  }
}

// ---------------------------------------------------------------------------
// Trigger → Note-on / Note-off
// ---------------------------------------------------------------------------

function processMidiTrigger(shape) {
  const note = SHAPE_NOTES[shape];
  if (note === undefined) {
    console.warn("[midi] Unknown shape:", shape);
    return;
  }

  const ch = MIDI_CFG.CH_TRIGGERS;

  // Note-on
  // "attack" replaces "velocity" on older versions
  midiOutput.playNote(note, ch, { attack: 1.0 }); // WebMidi.js uses 0–1 velocity

  // Note-off after delay
  setTimeout(() => {
    midiOutput.stopNote(note, ch);
  }, MIDI_CFG.NOTE_OFF_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Scale 0–1 float to 0–127 integer
function to127(v) {
  return Math.round(Math.max(0, Math.min(1, v)) * 127);
}

function sendCC(channel, cc, value) {
  midiOutput.sendControlChange(cc, value, channel);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

initMidi();
