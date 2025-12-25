// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public")); // folder kung saan naka-save ang HTML mo

let messages = []; // simple in-memory storage

// Admin sends message
app.post("/admin/message", (req, res) => {
  const { message } = req.body;
  if(!message) return res.status(400).json({ error: "Message required" });
  const msgObj = { text: message, timestamp: Date.now() };
  messages.push(msgObj);

  io.emit("new-message", msgObj); // broadcast sa lahat ng connected clients
  res.json({ status: "ok" });
});

// Get all messages (optional)
app.get("/messages", (req, res) => {
  res.json(messages);
});

// Start server
server.listen(3000, () => console.log("Server running on http://localhost:3000"));
