# 418: I'm a Teapot

A real-time participatory audiovisual presentation for Tech Why? Conference 2026.

## Setup

```bash
npm install
npm start
```

Then open:

- Presenter view: http://localhost:3000/
- Audience control surface: http://localhost:3000/play

## Manual steps

Strudel runs in a separate browser tab — no integration file needed

## Structure

```
418-teapot/
├── server.js              # Static file server + WebSocket logic
├── package.json
├── public/
│   ├── index.html         # Presenter view
│   ├── play.html          # Audience control surface
│   ├── css/
│   │   ├── normalize.css  # Drop in manually
│   │   ├── base.css       # Shared early-web tokens
│   │   ├── index.css      # Presenter styles
│   │   └── play.css       # Audience styles
│   ├── js/
│   │   ├── p5.js          # Drop in manually
│   │   ├── sketch.js      # p5 sketch
│   │   ├── ws-client.js   # WebSocket client
│   │   └── controls.js    # Control surface generator
│   └── assets/
│       └── fonts/
└── README.md
```
