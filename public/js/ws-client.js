// ws-client.js
// Shared WebSocket client — used by both index.html and play.html

const WS_URL = `ws://${location.host}`;

let socket;
let onMessageCallback = null;

function connect() {
  socket = new WebSocket(WS_URL);

  socket.addEventListener("open", () => {
    console.log("[ws] connected");
  });

  socket.addEventListener("message", (event) => {
    if (onMessageCallback) {
      try {
        const data = JSON.parse(event.data);
        onMessageCallback(data);
      } catch (e) {
        console.warn("[ws] non-JSON message:", event.data);
      }
    }
  });

  socket.addEventListener("close", () => {
    console.log("[ws] disconnected — retrying in 2s");
    setTimeout(connect, 2000);
  });

  socket.addEventListener("error", (err) => {
    console.error("[ws] error:", err);
  });
}

function send(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function onMessage(callback) {
  onMessageCallback = callback;
}

connect();
