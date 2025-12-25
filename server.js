const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(bodyParser.json());

// Store messages (in memory)
let messages = [];

// API for admin to send message
app.post("/admin/message", (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  const msgObj = { text: message, timestamp: Date.now() };
  messages.push(msgObj);

  // Emit to all connected clients
  io.emit("new-message", msgObj);

  res.json({ status: "ok" });
});

// Optional: get all messages
app.get("/messages", (req, res) => res.json(messages));

// Redirect root to index.html
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// Socket.io connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  // Optional: send last 5 messages
  messages.slice(-5).forEach(msg => socket.emit("new-message", msg));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
