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

// Clean URLs: / -> index.html, /play -> play.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/play", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "play.html"));
});

// --- WebSocket ---

const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`Client connected. Total: ${clients.size}`);

  ws.on("message", (data) => {
    // Broadcast incoming control messages to all OTHER clients
    // (audience -> presenter/sketch)
    for (const client of clients) {
      if (client !== ws && client.readyState === 1) {
        client.send(data);
      }
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`Client disconnected. Total: ${clients.size}`);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
  });
});

server.listen(PORT, () => {
  console.log(`"418: I'm a teapot" server running at http://localhost:${PORT}`);
  console.log(`Presenter: http://localhost:${PORT}/`);
  console.log(`Audience:  http://localhost:${PORT}/play`);
});
