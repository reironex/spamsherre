const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

const ADMIN_USER = "admin";
const ADMIN_PASS = "supersecret123"; 

let announcement = { message: "", updatedAt: null };
const allShares = []; 
const total = new Map();      
const timers = new Map();     

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoints
app.get('/api/announcement', (req, res) => res.json(announcement));

app.post('/api/announcement', (req, res) => {
  const { username, password, message } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).json({ error: "Unauthorized" });
  if (!message || message.trim() === "") return res.status(400).json({ error: "Empty message" });

  announcement = { message, updatedAt: Date.now() };
  res.json({ status: 200, message: "Announcement updated" });
});

app.get('/total', (req, res) => {
  const data = Array.from(total.values()).map((link, index) => ({
    session: index + 1,
    ...link
  }));
  res.json(data);
});

app.get('/shares', (req, res) => res.json(allShares));

app.post('/api/submit', async (req, res) => {
  const { cookie, url, amount, interval, label } = req.body;
  if (!cookie || !url || !amount || !interval) return res.status(400).json({ error: 'Missing fields' });

  try {
    const cookies = await convertCookie(cookie);
    const id = await share(cookies, url, amount, interval, label);
    allShares.push({ id, url, time: Date.now() });
    res.status(200).json({ status: 200, id });
  } catch (err) {
    res.status(500).json({ status: 500, error: err.message || err });
  }
});

app.post('/api/stop', (req, res) => {
  const { id } = req.body;
  if (id && timers.has(id)) {
    clearInterval(timers.get(id));
    timers.delete(id);
    total.delete(id);
    return res.json({ status: 200, message: `Stopped ${id}` });
  }
  timers.forEach((t, k) => clearInterval(t));
  timers.clear();
  total.clear();
  res.json({ status: 200, message: 'All stopped' });
});

// Helper Functions
async function share(cookies, url, amount, interval, label) {
  const id = await getPostID(url);
  const accessToken = await getAccessToken(cookies);
  if (!id) throw new Error("Invalid URL or Private Post");

  total.set(id, { url, id, label, count: 0, target: amount, startTime: Date.now() });

  const timer = setInterval(async () => {
    try {
      const response = await axios.post(`https://graph.facebook.com/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${accessToken}`, {}, { headers: { 'cookie': cookies } });
      if (response.status === 200) {
        const curr = total.get(id);
        if (curr) {
          curr.count++;
          if (curr.count >= amount) {
            clearInterval(timers.get(id));
            timers.delete(id);
          }
        }
      }
    } catch (e) {
      clearInterval(timers.get(id));
      timers.delete(id);
    }
  }, interval * 1000);

  timers.set(id, timer);
  return id;
}

async function getPostID(url) {
  try {
    const res = await axios.post('https://id.traodoisub.com/api.php', `link=${encodeURIComponent(url)}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return res.data.id;
  } catch { return null; }
}

async function getAccessToken(cookie) {
  try {
    const res = await axios.get('https://business.facebook.com/content_management', { headers: { 'cookie': cookie } });
    const token = res.data.match(/"accessToken":\s*"([^"]+)"/);
    return token ? token[1] : null;
  } catch { return null; }
}

async function convertCookie(cookie) {
  try {
    const cookies = JSON.parse(cookie);
    const sb = cookies.find(c => c.key === "sb");
    if (!sb) throw new Error("Invalid AppState");
    return cookies.map(c => `${c.key}=${c.value}`).join('; ');
  } catch {
    return cookie; // assume raw string if not JSON
  }
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
