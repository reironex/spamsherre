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
  const { cookie, url, amount, interval, isTurbo } = req.body;

  if (!cookie || !url || !amount) {
    return res.status(400).json({ error: 'Kulang ang data na nilagay mo.' });
  }

  try {
    const cleanCookie = await convertCookie(cookie);
    const id = await getPostID(url);
    const accessToken = await getAccessToken(cleanCookie);

    if (!id) throw new Error("Invalid Post URL.");
    if (!accessToken) throw new Error("Invalid Cookie/AppState.");

    total.set(id, { url, id, count: 0, target: parseInt(amount), startTime: Date.now() });

    let timer;
    if (isTurbo) {
      timer = setInterval(() => {
        const curr = total.get(id);
        if (!curr || curr.count >= amount) return stopSession(id);
        for (let i = 0; i < 100; i++) {
          if (curr.count < amount) runShareRequest(id, accessToken, cleanCookie);
        }
      }, 1000);
    } else {
      timer = setInterval(() => {
        const curr = total.get(id);
        if (!curr || curr.count >= amount) return stopSession(id);
        runShareRequest(id, accessToken, cleanCookie);
      }, parseInt(interval) * 1000);
    }

    timers.set(id, timer);
    allShares.push({ id, url, time: Date.now() });
    res.status(200).json({ status: 200, id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', (req, res) => {
  const { id } = req.body;
  if (id) {
    stopSession(id);
  } else {
    timers.forEach((t, k) => clearInterval(t));
    timers.clear();
    total.clear();
  }
  res.json({ status: 200, message: 'Stopped' });
});

async function runShareRequest(id, token, cookie) {
  try {
    await axios.post(`https://graph.facebook.com/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${token}`, {}, { headers: { 'cookie': cookie } });
    const curr = total.get(id);
    if (curr) curr.count++;
  } catch (e) {}
}

function stopSession(id) {
  if (timers.has(id)) {
    clearInterval(timers.get(id));
    timers.delete(id);
  }
}

async function getPostID(url) {
  try {
    const res = await axios.post('https://id.traodoisub.com/api.php', `link=${encodeURIComponent(url)}`, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return res.data.id;
  } catch { return null; }
}

async function getAccessToken(cookie) {
  try {
    const res = await axios.get('https://business.facebook.com/content_management', { headers: { 'cookie': cookie, 'user-agent': 'Mozilla/5.0' } });
    const token = res.data.match(/"accessToken":\s*"([^"]+)"/);
    return token ? token[1] : null;
  } catch { return null; }
}

async function convertCookie(cookie) {
  try {
    const cookies = JSON.parse(cookie);
    return cookies.map(c => `${c.key}=${c.value}`).join('; ');
  } catch { return cookie; }
}

app.listen(PORT, () => console.log(`Server on ${PORT}`));
