const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs'); // (hindi tinanggal, kahit di na kailangan)
const mongoose = require('mongoose');

const app = express();

/* =======================
   MONGODB SETUP
======================= */
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const ShareSchema = new mongoose.Schema({
  id: String,
  url: String,
  time: Number
});

const Share = mongoose.model('Share', ShareSchema);

/* =======================
   ADMIN CONFIG
======================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "supersecret123";

let announcement = {
  message: "",
  updatedAt: null
};

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

/* =======================
   ANNOUNCEMENT API
======================= */
app.get('/api/announcement', (req, res) => {
  res.json(announcement);
});

app.post('/api/announcement', (req, res) => {
  const { username, password, message } = req.body;

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "Empty message" });
  }

  announcement = {
    message,
    updatedAt: Date.now()
  };

  res.json({ status: 200, message: "Announcement updated" });
});

/* =======================
   SESSION MAPS (DI TINANGGAL)
======================= */
const total = new Map();
const timers = new Map();

/* =======================
   TOTAL API
======================= */
app.get('/total', (req, res) => {
  const data = Array.from(total.values()).map((link, index) => ({
    session: index + 1,
    url: link.url,
    id: link.id,
    label: link.label,
    count: link.count,
    target: link.target,
    startTime: link.startTime
  }));

  res.json(JSON.parse(JSON.stringify(data || [], null, 2)));
});

/* =======================
   SHARES API (FROM DB)
======================= */
app.get('/shares', async (req, res) => {
  const shares = await Share.find({}).sort({ time: 1 });
  res.json(shares);
});

/* =======================
   HOME
======================= */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* =======================
   SUBMIT API
======================= */
app.post('/api/submit', async (req, res) => {
  const { cookie, url, amount, interval, label } = req.body;
  if (!cookie || !url || !amount || !interval) {
    return res.status(400).json({
      error: 'Missing state, url, amount, or interval'
    });
  }

  try {
    const cookies = await convertCookie(cookie);
    if (!cookies) {
      return res.status(400).json({ status: 500, error: 'Invalid cookies' });
    }

    const id = await share(cookies, url, amount, interval, label);

    // ✅ SAVE TO MONGODB (PERSISTENT)
    await Share.create({
      id,
      url,
      time: Date.now()
    });

    res.status(200).json({ status: 200, id });
  } catch (err) {
    return res.status(500).json({ status: 500, error: err.message || err });
  }
});

/* =======================
   STOP API
======================= */
app.post('/api/stop', (req, res) => {
  const { id } = req.body;

  if (id) {
    if (timers.has(id)) {
      clearInterval(timers.get(id));
      timers.delete(id);
      total.delete(id);
      return res.json({ status: 200, message: `Session ${id} tinigil na` });
    }
    return res.status(404).json({ error: 'Walang active session na may ganitong id' });
  }

  timers.forEach((timer, key) => {
    clearInterval(timer);
    total.delete(key);
  });

  timers.clear();
  return res.json({ status: 200, message: 'Lahat ng sessions tinigil na' });
});

/* =======================
   SHARE LOGIC (DI BINAGO)
======================= */
async function share(cookies, url, amount, interval, label) {
  const id = await getPostID(url);
  const accessToken = await getAccessToken(cookies);
  if (!id) throw new Error("Unable to get link id");

  total.set(id, {
    url,
    id,
    label,
    count: 0,
    target: amount,
    startTime: Date.now()
  });

  const headers = {
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate',
    'connection': 'keep-alive',
    'content-length': '0',
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

      if (sharedCount === amount) {
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

  setTimeout(() => {
    if (timers.has(id)) {
      clearInterval(timers.get(id));
      timers.delete(id);
      total.delete(id);
    }
  }, amount * interval * 1000);

  return id;
}

/* =======================
   HELPERS (DI BINAGO)
======================= */
async function getPostID(url) {
  try {
    const response = await axios.post(
      'https://id.traodoisub.com/api.php',
      `link=${encodeURIComponent(url)}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.id;
  } catch {}
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
    if (token && token[1]) return token[1];
  } catch {}
}

async function convertCookie(cookie) {
  return new Promise((resolve, reject) => {
    try {
      const cookies = JSON.parse(cookie);
      const sbCookie = cookies.find(c => c.key === "sb");
      if (!sbCookie) reject("Invalid appstate");

      const data = `sb=${sbCookie.value}; ${cookies
        .slice(1)
        .map(c => `${c.key}=${c.value}`)
        .join('; ')}`;

      resolve(data);
    } catch {
      reject("Error processing appstate");
    }
  });
}

/* =======================
   SERVER
======================= */
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
