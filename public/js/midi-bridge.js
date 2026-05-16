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

  NOTE_OFF_DELAY_MS: 50, // ms before sending note-off after note-on
};

// Shape → MIDI note mapping (channel 2)
const SHAPE_NOTES = {
  square: 54, // F#4
  triangle: 57, // A4
  circle: 59, // B4
  hexagon: 61, // C#5
  starburst: 64, // E5
  cross: 66, // F#5
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

const lastSentGain = new Array(12).fill(-1);
const lastSentMute = new Array(12).fill(-1);
const lastSentProb = new Array(12).fill(-1);

const MIDI_CHANGE_THRESHOLD = 2; // out of 127

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

    // Prime all CCs with safe defaults so Strudel never receives NaN on startup
    setTimeout(() => {
      // Gains — default to 90 (0.7 normalised)
      for (let i = 0; i < 12; i++) {
        sendCC(MIDI_CFG.CH_PARAMS, MIDI_CFG.CC_GAIN_BASE + i, 127);
        lastSentGain[i] = 127;
      }
      // Probs — default to 0 (no degradeBy)
      for (let i = 0; i < 12; i++) {
        sendCC(MIDI_CFG.CH_PARAMS, MIDI_CFG.CC_PROB_BASE + i, 0);
        lastSentProb[i] = 0;
      }
      // Mutes — default to 0 (unmuted)
      for (let i = 0; i < 12; i++) {
        sendCC(MIDI_CFG.CH_PARAMS, MIDI_CFG.CC_MUTE_BASE + i, 0);
        lastSentMute[i] = 0;
      }
      console.log("[midi] Default CC values primed");
    }, 2000);
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
  // Binary — no threshold, any change fires immediately
  // Process first so muteState is fresh when we gate gains below
  if (Array.isArray(msg.mutes)) {
    msg.mutes.forEach((muted, i) => {
      const wasMuted = muteState[i];
      muteState[i] = muted;
      const cc = MIDI_CFG.CC_MUTE_BASE + i;
      const val = muted ? 127 : 0;

      if (val !== lastSentMute[i]) {
        sendCC(ch, cc, val);
        lastSentMute[i] = val;

        // Track just unmuted — flush current gain so Strudel isn't stale
        if (wasMuted && !muted) {
          const gainCC = MIDI_CFG.CC_GAIN_BASE + i;
          const gainVal = to127(gainState[i]);
          sendCC(ch, gainCC, gainVal);
          lastSentGain[i] = gainVal;
        }
      }
    });
  }

  // --- Gains (CC 1–12) — gated by mute, only send if value moved meaningfully ---
  if (Array.isArray(msg.gains)) {
    msg.gains.forEach((gain, i) => {
      gainState[i] = gain; // always update internal state
      if (muteState[i]) return; // suppress CC while muted
      const val = to127(gain);
      if (Math.abs(val - lastSentGain[i]) > MIDI_CHANGE_THRESHOLD) {
        sendCC(ch, MIDI_CFG.CC_GAIN_BASE + i, val);
        lastSentGain[i] = val;
      }
    });
  }

  // --- Probs (CC 13–24) — no gating, only send if value moved meaningfully ---
  if (Array.isArray(msg.probs)) {
    msg.probs.forEach((prob, i) => {
      const val = to127(prob);
      if (Math.abs(val - lastSentProb[i]) > MIDI_CHANGE_THRESHOLD) {
        sendCC(ch, MIDI_CFG.CC_PROB_BASE + i, val);
        lastSentProb[i] = val;
      }
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
