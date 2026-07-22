// ws-client.js
// Shared WebSocket client — used by both index.html and play.html
// On index.html: pipes incoming messages to handleSketchMessage() and handleMidiMessage()
// On play.html:  incoming state messages are not used (controls are send-only)

const WS_URL = `ws://${location.host}`;

// index.html marks <html data-role="presenter">; play.html leaves it unset
const ROLE = document.documentElement.dataset.role === "presenter" ? "presenter" : "audience";

// #conn-status only exists on play.html — no-op elsewhere
const connStatusEl = document.getElementById("conn-status");
function setConnStatus(connected) {
  if (connStatusEl) connStatusEl.classList.toggle("connected", connected);
}

let socket;

function connect() {
  socket = new WebSocket(WS_URL);

  socket.addEventListener("open", () => {
    console.log("[ws] connected");
    setConnStatus(true);
    send({ type: "register", role: ROLE });
  });

  socket.addEventListener("message", (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.warn("[ws] non-JSON message:", event.data);
      return;
    }

    // Presenter view — route to sketch and MIDI bridge
    if (typeof handleSketchMessage === "function") handleSketchMessage(data);
    if (typeof handleMidiMessage === "function") handleMidiMessage(data);
  });

  socket.addEventListener("close", () => {
    console.log("[ws] disconnected — retrying in 2s");
    setConnStatus(false);
    setTimeout(connect, 2000);
  });

  socket.addEventListener("error", (err) => {
    console.error("[ws] error:", err);
    setConnStatus(false);
  });
}

function send(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

connect();
