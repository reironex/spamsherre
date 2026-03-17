const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const total = new Map();
const timers = new Map();

app.get('/total', (req, res) => {
  res.json(Array.from(total.values()));
});

app.post('/api/submit', async (req, res) => {
  const { cookie, url, amount, interval } = req.body;
  try {
    const cookies = await convertCookie(cookie);
    const id = await getPostID(url);
    if (!id) throw new Error("Private link or invalid URL");

    startSharing(cookies, id, amount, interval, url);
    res.json({ status: 200, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function startSharing(cookies, id, amount, interval, url) {
  const accessToken = await getAccessToken(cookies);
  total.set(id, { id, count: 0, target: amount, url });

  // 100 shares per second logic (10ms interval)
  const timer = setInterval(async () => {
    const session = total.get(id);
    if (!session || session.count >= amount) {
      clearInterval(timers.get(id));
      return;
    }

    try {
      // Fire and forget for maximum speed
      axios.post(`https://graph.facebook.com/v18.0/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${accessToken}`, {}, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile',
          'Cookie': cookies 
        }
      }).then(() => {
        session.count++;
      }).catch(e => {
        if(e.response?.status === 400) clearInterval(timers.get(id)); // Stop on lock
      });
    } catch (e) {}
  }, 10); // 10ms = 100 requests per second

  timers.set(id, timer);
}

// Utility functions (Simplified)
async function getPostID(url) {
  try {
    const res = await axios.post('https://id.traodoisub.com/api.php', `link=${encodeURIComponent(url)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data.id;
  } catch { return null; }
}

async function getAccessToken(cookie) {
  const res = await axios.get('https://business.facebook.com/content_management', { headers: { cookie } });
  return res.data.match(/"accessToken":\s*"([^"]+)"/)[1];
}

async function convertCookie(cookie) {
  try {
    const json = JSON.parse(cookie);
    return json.map(c => `${c.key}=${c.value}`).join('; ');
  } catch { return cookie; }
}

app.post('/api/stop', (req, res) => {
  timers.forEach(t => clearInterval(t));
  timers.clear();
  total.clear();
  res.json({ status: 200 });
});

app.listen(5000, () => console.log("Server running on port 5000"));
