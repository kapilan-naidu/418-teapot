# 418: I'm a Teapot

A real-time participatory audiovisual presentation for Tech Why? Conference 2026, organized by Tech Whye Conference in conjunction with [Feelers](https://www.feelers-feelers.com).

Audience members navigate to the IP address of the hosting device, land on a phone control surface, and each gets a small, randomized subset of controls: a few sliders, some toggle buttons, one or more shape triggers, maybe a canvas to draw on. Individually none of it does much. Aggregated across the room, it drives a generative p5.js visual on the big screen and a 12-track generative music patch running live in [Strudel](https://strudel.cc). The talk's thesis: the browser never stopped being able to do weird, playful things — we just stopped asking it to.

## Prerequisites

- **Node.js**
- **A Chromium-based browser** (Chrome or Edge) for the presenter view — it talks to Strudel over [WebMIDI](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API), which Safari and Firefox don't support. The visuals and slides will still run in any browser, just without the audio link.
- **IAC Driver Bus 1** enabled, on macOS: Audio MIDI Setup → Window → Show MIDI Studio → double-click IAC Driver → check "Device is online". The port must be named exactly `IAC Driver Bus 1` — that's what `midi-bridge.js` and `strudel/patch.js` both look for. IAC is macOS-only — on Windows, install a virtual MIDI loopback tool instead (e.g. [loopMIDI](https://www.tobias-erichsen.de/software/loopmidi.html)), then update the port name in both `midi-bridge.js` and `strudel/patch.js` to match whatever you name the virtual port.
- **[Strudel](https://strudel.cc)** open in its own browser tab — it's not served by this app, you paste the patch in manually.
- **A way to reach the server from audience phones** — same Wi-Fi/LAN as your laptop, or a tunnel like [ngrok](https://ngrok.com) if the network won't allow it.

## Setup

```bash
npm install
npm start
```

- Presenter view: http://localhost:3000/
- Audience control surface: http://localhost:3000/play

## Running the show

Boot order matters — audio and MIDI need to be wired up before the audience joins:

1. `npm start`
2. Open the presenter view in Chrome/Edge and grant the WebMIDI permission prompt.
3. Open [strudel.cc](https://strudel.cc) in a separate tab, paste in [`strudel/patch.js`](strudel/patch.js), grant it WebMIDI permission too, and hit play.
4. Share the `/play` URL (or a QR code pointing at it) with the audience.
5. Walk through the slide deck as normal — the p5 sketch prewarms on slide 4 and goes fully live on slide 6, driven by whatever the room is doing on their phones.

Press `d` on slide 6 to toggle a small presenter-only status panel (connected client count, active palette, live particle levels, a rolling event log). This panel is displayed by default.

## Architecture

```
418-teapot/
├── server.js               Express static server + WebSocket hub
├── strudel/
│   └── patch.js             Strudel REPL patch — paste into strudel.cc, not served by Node
└── public/
    ├── index.html            Presenter view: slide deck + p5 sketch + dashboard
    ├── play.html              Audience control surface
    ├── css/
    │   ├── base.css            Shared tokens (colors, fonts, spacing)
    │   ├── index.css           Presenter/slide styles
    │   ├── play.css            Audience control surface styles
    │   ├── dashboard.css       Presenter status panel styles
    │   ├── normalize.css       Vendored reset
    │   └── sass.css            Additional slide styling
    ├── js/
    │   ├── palettes.js         Shared color palette data
    │   ├── slides.js           Slide navigation + sketch lifecycle
    │   ├── sketch.js           p5 particle/shape/motif sketch, driven by WS state
    │   ├── controls.js         Builds each audience member's randomized control set
    │   ├── ws-client.js        Shared WebSocket client (both pages)
    │   ├── dashboard.js        Presenter-only status panel (slide 6 only, 'd' to toggle)
    │   ├── midi-bridge.js      Routes WS state → WebMIDI CC/note-on for Strudel
    │   ├── p5.min.js           Vendored p5.js
    │   └── webmidi.iife.js     Vendored WebMIDI.js
    └── images/                 GIFs and word-art for the slide deck
```

**The server** (`server.js`) aggregates every connected audience client's sliders into one set of values — continuous params (gains, probabilities, particle sliders) use an exponential-weighted average where extreme values pull harder than mid-range ones, mutes use a majority vote — and broadcasts the result to everyone every 50ms. One-off events (shape triggers, drawn motifs, palette changes, color picks) are relayed immediately instead of aggregated. The presenter tab registers its role on connect so it's excluded from the audience count.

**The presenter view** turns that aggregate state into two things: the p5 visual (`sketch.js`), and outgoing WebMIDI for Strudel (`midi-bridge.js`) — track gains/probabilities/mutes go out as CC on channel 1, shape triggers as note-on on channel 2. Strudel's patch reads those same CCs to shape the 12 tracks live.

## Audience controls

Each `/play` client gets a fresh, randomized layout on load — never the full instrument, just a slice of it:

- **70% chance** of 6 controls, **30% chance** of 4 controls + a motif-drawing canvas (draw a shape, send it to the visual).
- Controls are drawn from a shared pool: per-track gain ("signal"), mute ("on / off"), and probability ("chance") sliders (×12 tracks), 6 particle sliders (density/speed/size/opacity/drift/chaos), and 6 shape-trigger buttons.
- **~10% chance** one slot becomes a palette cycler instead.
- Every client also gets a color picker, which tints their own slider accents, mute buttons, and motif canvas strokes, and tags whatever shapes/motifs they send.

Nobody sees the same control surface twice — that's deliberate. The room has to cooperate (or not) without anyone having the full picture.

## Platform quirks

- **iOS Safari** silently ignores the [Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API) — audience members on iPhones lose the haptic tap-feedback on triggers/motifs/palette, everything else works normally.
- **WebMIDI** only works in Chromium-based browsers. The presenter view _must_ run in Chrome or Edge for the Strudel link to work; Safari/Firefox will run the slides and visuals fine but silently skip the MIDI bridge (check the console for `[midi]` warnings).

## License

See [LICENSE](LICENSE).
