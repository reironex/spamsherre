const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

const FILE = 'admin-messages.json';

// Ensure file exists
if (!fs.existsSync(FILE)) {
  fs.writeFileSync(FILE, JSON.stringify([]));
}

// GET all messages
app.get('/messages', (req, res) => {
  const messages = JSON.parse(fs.readFileSync(FILE));
  res.json(messages);
});

// POST new message (admin only)
app.post('/messages', (req, res) => {
  const { username, password, message } = req.body;

  // Simple admin auth
  if (username !== 'admin' || password !== 'johnalpays') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const messages = JSON.parse(fs.readFileSync(FILE));
  messages.push({ message, time: Date.now() });
  fs.writeFileSync(FILE, JSON.stringify(messages, null, 2));
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
