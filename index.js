const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
// Siguraduhin na ang 'public' folder ay nababasa
app.use(express.static(path.join(__dirname, 'public')));

const total = new Map();
const timers = new Map();

// Para makuha ang share count sa baba ng UI
app.get('/total', (req, res) => {
  res.json(Array.from(total.values()));
});

// Main Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/submit', async (req, res) => {
  const { cookie, url, amount } = req.body;
  try {
    const cookies = await convertCookie(cookie);
    const id = await getPostID(url);
    if (!id) throw new Error("Invalid URL or Private Post");

    const accessToken = await getAccessToken(cookies);
    if (!accessToken) throw new Error("Invalid AppState");

    // I-initialize ang session data
    total.set(id, { id, count: 0, target: parseInt(amount) || 1000, url });

    // 100 shares per second logic (10ms)
    const timer = setInterval(() => {
      const session = total.get(id);
      if (!session || session.count >= session.target) {
        clearInterval(timers.get(id));
        return;
      }

      axios.post(`https://graph.facebook.com/v18.0/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${accessToken}`, {}, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile',
          'Cookie': cookies 
        }
      }).then(() => {
        session.count++;
      }).catch(e => {
        if (e.response?.status === 400 || e.response?.status === 401) {
          clearInterval(timers.get(id));
        }
      });
    }, 10); 

    timers.set(id, timer);
    res.json({ status: 200, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', (req, res) => {
  timers.forEach(t => clearInterval(t));
  timers.clear();
  total.clear();
  res.json({ status: 200 });
});

// API para makuha ang ID
async function getPostID(url) {
  try {
    const res = await axios.post('https://id.traodoisub.com/api.php', `link=${encodeURIComponent(url)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data.id;
  } catch { return null; }
}

// Token extractor
async function getAccessToken(cookie) {
  try {
    const res = await axios.get('https://business.facebook.com/content_management', { headers: { cookie } });
    const match = res.data.match(/"accessToken":\s*"([^"]+)"/);
    return match ? match[1] : null;
  } catch { return null; }
}

async function convertCookie(cookie) {
  try {
    const json = JSON.parse(cookie);
    return json.map(c => `${c.key}=${c.value}`).join('; ');
  } catch { return cookie; }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
