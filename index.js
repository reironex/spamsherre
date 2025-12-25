const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ================= DATA STORES =================
const total = new Map();   // session info
const timers = new Map();  // interval timers

// ================= MESSAGE API (ADMIN LOGS ONLY) =================
app.post("/api/message", (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.sendStatus(400);
  }

  // 🔐 RENDER LOGS (ADMIN ONLY)
  console.log("📩 NEW USER MESSAGE");
  console.log("🕒 Time:", new Date().toLocaleString());
  console.log("💬 Message:", message);
  console.log("================================");

  // No response shown on website
  res.sendStatus(204); // No Content
});

// ================= TOTAL API =================
app.get('/total', (req, res) => {
  const data = Array.from(total.values()).map((link, index) => ({
    session: index + 1,
    url: link.url,
    count: link.count,
    id: link.id,
    target: link.target,
  }));

  res.json(data || []);
});

// ================= HOME =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ================= SUBMIT API =================
app.post('/api/submit', async (req, res) => {
  const { cookie, url, amount, interval } = req.body;

  if (!cookie || !url || !amount || !interval) {
    return res.status(400).json({
      error: 'Missing cookie, url, amount, or interval'
    });
  }

  try {
    const cookies = await convertCookie(cookie);
    if (!cookies) {
      return res.status(400).json({ error: 'Invalid cookies' });
    }

    const id = await share(cookies, url, amount, interval);
    res.status(200).json({ status: 200, id });

  } catch (err) {
    res.status(500).json({ error: err.message || err });
  }
});

// ================= STOP API =================
app.post('/api/stop', (req, res) => {
  const { id } = req.body;

  if (id) {
    if (timers.has(id)) {
      clearInterval(timers.get(id));
      timers.delete(id);
      total.delete(id);
      return res.json({ status: 200, message: `Session ${id} stopped` });
    }
    return res.status(404).json({ error: 'Session not found' });
  }

  // stop all
  timers.forEach(timer => clearInterval(timer));
  timers.clear();
  total.clear();

  res.json({ status: 200, message: 'All sessions stopped' });
});

// ================= SHARE FUNCTION =================
async function share(cookies, url, amount, interval) {
  const id = await getPostID(url);
  const accessToken = await getAccessToken(cookies);

  if (!id) throw new Error("Invalid or private Facebook link");

  total.set(id, { url, id, count: 0, target: amount });

  const headers = {
    'accept': '*/*',
    'cookie': cookies,
    'host': 'graph.facebook.com'
  };

  let sharedCount = 0;

  async function sharePost() {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${accessToken}`,
        {},
        { headers }
      );

      if (response.status === 200) {
        total.set(id, {
          ...total.get(id),
          count: total.get(id).count + 1
        });
        sharedCount++;
      }

      if (sharedCount >= amount) {
        clearInterval(timers.get(id));
        timers.delete(id);
      }

    } catch {
      clearInterval(timers.get(id));
      timers.delete(id);
      total.delete(id);
    }
  }

  const timer = setInterval(sharePost, interval * 1000);
  timers.set(id, timer);

  // auto cleanup
  setTimeout(() => {
    if (timers.has(id)) {
      clearInterval(timers.get(id));
      timers.delete(id);
      total.delete(id);
    }
  }, amount * interval * 1000);

  return id;
}

// ================= HELPERS =================
async function getPostID(url) {
  try {
    const response = await axios.post(
      'https://id.traodoisub.com/api.php',
      `link=${encodeURIComponent(url)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.id;
  } catch {
    return null;
  }
}

async function getAccessToken(cookie) {
  try {
    const response = await axios.get(
      'https://business.facebook.com/content_management',
      {
        headers: {
          'cookie': cookie,
          'referer': 'https://www.facebook.com/'
        }
      }
    );

    const token = response.data.match(/"accessToken":\s*"([^"]+)"/);
    return token ? token[1] : null;

  } catch {
    return null;
  }
}

async function convertCookie(cookie) {
  return new Promise((resolve, reject) => {
    try {
      const cookies = JSON.parse(cookie);
      const sb = cookies.find(c => c.key === "sb");
      if (!sb) reject("Invalid appstate");

      const result = `sb=${sb.value}; ` +
        cookies.slice(1).map(c => `${c.key}=${c.value}`).join('; ');

      resolve(result);
    } catch {
      reject("Invalid cookie format");
    }
  });
}

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
