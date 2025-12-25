import express from "express";
import http from "http";
import { Server } from "socket.io";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Store messages in memory
let messages = [];

// Admin sends message
app.post("/admin/message", (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ status: "error", error: "Message is required" });

  const msgObj = { text: message, time: Date.now() };
  messages.push(msgObj);

  // Broadcast to all clients
  io.emit("new-message", msgObj);

  res.json({ status: "ok" });
});

// Test route for clients
app.get("/messages", (req, res) => {
  res.json(messages);
});

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  // Send previous messages
  messages.forEach((msg) => socket.emit("new-message", msg));

  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
