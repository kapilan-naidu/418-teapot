// 418: I'm a Teapot — Strudel patch
// 125 BPM, F# minor with jazz extensions
// MIDI CC channel 1: gains (1-12), probs (13-24), mutes (25-36)
// MIDI note-on channel 2: shape triggers (notes 60-65)

const allCC = await midin("IAC Driver Bus 1"); // or name of your MIDI device
const cc = (n) => allCC(n, 1);
const kb = await midikeys("IAC Driver Bus 1");

setcps(125 / 60 / 4);

// ---------------------------------------------------------------------------
// Harmonic material — F# minor jazz: Fsm9, Amaj7, Bm11, D9
// ---------------------------------------------------------------------------

const penta = ["fs4", "a4", "b4", "cs5", "e5", "fs5", "a5"];
const pentaLow = ["fs3", "a3", "b3", "cs4", "e4"];

// ---------------------------------------------------------------------------
// MIDI CC helpers
// cc(1-12)  → gains
// cc(13-24) → probs (degradeBy)
// cc(25-36) → mutes (127 = silent)
// ---------------------------------------------------------------------------

let g = (n) => cc(n).range(0, 1);
let p = (n) => cc(n + 12).range(0, 0.85);
let vol = (gCC, mCC) =>
  cc(gCC)
    .range(0, 1)
    .mul(cc(mCC + 24).range(1, 0));

// ---------------------------------------------------------------------------
// Track 1: Kick — 909, 4-on-the-floor with occasional dropout
// ---------------------------------------------------------------------------

$track1: sound("bd")
  .bank("RolandTR909")
  .struct("x ~ ~ ~ x ~ ~ ~ x ~ ~ ~ x ~ ~ ~")
  .sometimes((x) => x.struct("x ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~"))
  .gain(vol(1, 1))
  .degradeBy(p(1));

// ---------------------------------------------------------------------------
// Track 2: Snare / Claps — layered 909 sd + cp on 2 and 4
// ---------------------------------------------------------------------------

$track2: stack(
  sound("sd:2")
    .bank("RolandTR909")
    .struct("~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~")
    .rarely((x) => x.struct("~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ x ~ ~ ~"))
    .gain(vol(2, 2).mul(0.8))
    .degradeBy(p(2)),

  sound("cp")
    .bank("RolandTR909")
    .struct("~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~")
    .sometimesBy(0.3, (x) => x.gain(0))
    .gain(vol(2, 2).mul(0.5))
    .degradeBy(p(2))
);

// ---------------------------------------------------------------------------
// Track 3: Top percussion — 808, euclidean rhythms
// ---------------------------------------------------------------------------

$track3: sound("mt ht lt")
  .bank("RolandTR808")
  .euclid(5, 16)
  .sometimes((x) => x.euclid(7, 16))
  .gain(vol(3, 3).mul(0.7))
  .degradeBy(p(3));

// ---------------------------------------------------------------------------
// Track 4: Hi-hats — 909, 16th grid with velocity swing
// ---------------------------------------------------------------------------

$track4: sound("hh")
  .bank("RolandTR909")
  .struct("x x x x x x x x x x x x x x x x")
  .velocity("0.6 0.3 0.5 0.3 0.6 0.3 0.5 0.3 0.6 0.3 0.5 0.3 0.6 0.3 0.9 0.3")
  .gain(vol(4, 4))
  .degradeBy(p(4));

// ---------------------------------------------------------------------------
// Track 5: Bass — sawtooth, root/fifth cycling patterns
// ---------------------------------------------------------------------------

$track5: note(
  "<[fs2 ~ fs2 ~ a2 ~ ~ ~] [fs2 ~ cs3 ~ b2 ~ ~ ~] [d2 ~ d2 ~ a2 ~ fs2 ~] [b2 ~ ~ ~ e2 ~ ~ ~] [fs2 ~ ~ ~ cs3 ~ ~ ~] [d2 ~ fs2 ~ ~ ~ a2 ~] [b1 ~ ~ ~ fs2 ~ e2 ~] [cs2 ~ ~ ~ a2 ~ ~ ~]>"
)
  .sound("sawtooth")
  .lpf(cc(5).range(200, 1200))
  .lpq(2)
  .attack(0.01)
  .release(0.3)
  .gain(vol(5, 5).mul(0.9))
  .degradeBy(p(5));

// ---------------------------------------------------------------------------
// Track 6: Chord pads — long attack, slow chord cycle
// ---------------------------------------------------------------------------

$track6: note(
  "<[fs3,a3,cs4,e4,gs4] [a3,cs4,e4,gs4,b4] [b3,d4,fs4,a4,e4] [d4,fs4,a4,e5] [cs4,e4,gs4,b4] [a3,cs4,fs4,a4,e4]>"
)
  .slow(10)
  .sound("gm_pad_warm")
  .attack(0.8)
  .release(2)
  .gain(vol(6, 6).mul(0.25))
  .degradeBy(p(6));

// ---------------------------------------------------------------------------
// Track 7: Chord stabs — square synth, choppy offbeat hits
// ---------------------------------------------------------------------------

$track7: note(
  "<[~ [fs3,a3,cs4,e4] ~ ~] [~ ~ [a3,cs4,e4,gs4] ~] [~ [b3,d4,fs4,a4] ~ ~] [~ ~ ~ [d4,fs4,a4]] [~ [cs4,e4,gs4,b4] ~ ~]>"
)
  .sound("square")
  .attack(0.01)
  .release(0.08)
  .lpf(cc(7).range(400, 3000))
  .gain(vol(7, 7).mul(0.35))
  .degradeBy(p(7));

// ---------------------------------------------------------------------------
// Track 8: Arpeggios — triangle synth, 16th notes over chord tones
// ---------------------------------------------------------------------------

$track8: note(
  "<[fs4 a4 cs5 e5 gs5 e5 cs5 a4] [a4 cs5 e5 gs5 b5 gs5 e5 cs5] [b4 d5 fs5 a5 e5 a5 fs5 d5] [cs5 e5 gs5 b5 gs5 e5 cs5 a4] [d5 fs5 a5 e5 cs5 a4 fs4 d4] [e4 gs4 b4 e5 b4 gs4 e4 b3]>"
)
  .sound("triangle")
  .attack(0.01)
  .release(0.05)
  .gain(vol(8, 8).mul(0.4))
  .degradeBy(p(8));

// ---------------------------------------------------------------------------
// Track 9: Melody — sine, sparse, pentatonic
// ---------------------------------------------------------------------------

$track9: note(
  "<fs4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ a4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ cs5 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ e5 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ b4 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ fs5 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~>"
)
  .sound("sine")
  .attack(0.05)
  .release(0.8)
  .gain(vol(9, 9).mul(0.55))
  .degradeBy(p(9));

// ---------------------------------------------------------------------------
// Track 10: Counter-melody — sawtooth with filter, answers melody
// ---------------------------------------------------------------------------

$track10: note(choose(pentaLow))
  .struct("~ ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~")
  .sometimes((x) => x.struct("~ ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~"))
  .sound("sawtooth")
  .lpf(cc(10).range(300, 2000))
  .lpq(3)
  .attack(0.02)
  .release(0.4)
  .gain(vol(10, 10).mul(0.4))
  .degradeBy(p(10));

// ---------------------------------------------------------------------------
// Track 11: Shimmer / drone — supermandolin, long sustain
// ---------------------------------------------------------------------------

$track11: note(
  "<[fs5 ~ ~ ~ ~ ~ ~ ~] [a5 ~ ~ ~ ~ ~ ~ ~] [cs5 ~ ~ ~ ~ ~ ~ ~] [b5 ~ ~ ~ ~ ~ ~ ~] [e5 ~ ~ ~ ~ ~ ~ ~]>"
)
  .slow(5)
  .sound("gm_string_ensemble_1")
  .attack(1.5)
  .release(3)
  .gain(vol(11, 11).mul(0.3))
  .degradeBy(p(11));

// ---------------------------------------------------------------------------
// Track 12: Ear candy — random one-shots and surprises
// ---------------------------------------------------------------------------

$track12: sound(choose(["casio", "gong", "metal"]))
  .struct("x ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")
  .rarely((x) => x.struct("x ~ ~ ~ ~ ~ ~ x ~ ~ x ~ ~ ~ ~ ~"))
  .speed(choose([0.5, 1, 1.5, 2]))
  .gain(vol(12, 12).mul(0.35))
  .degradeBy(p(12));

// ---------------------------------------------------------------------------
// Shape triggers — incoming MIDI notes 60-65
// ---------------------------------------------------------------------------

$triggers: stack(
  kb("54").sound("bd").bank("RolandTR909").gain(0.9),
  kb("57").sound("metal").gain(0.7),
  kb("59").sound("gm_fx_crystal").gain(0.4),
  kb("61").sound("gong").gain(0.6),
  kb("64").sound("noise").release(0.1).gain(0.5),
  kb("66").sound("casio").gain(0.65)
);
