const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// Admin Credentials
const ADMIN_USER = "admin";
const ADMIN_PASS = "supersecret123"; 

let announcement = { message: "", updatedAt: null };
const allShares = []; // Kasaysayan ng lahat ng matagumpay na shares
const total = new Map(); // Monitoring para sa active sessions
const timers = new Map(); // Imbakan ng mga running intervals

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---

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
  const { cookie, url, amount, interval, isTurbo } = req.body;

  if (!cookie || !url || !amount) {
    return res.status(400).json({ error: 'Kulang ang data na nilagay mo.' });
  }

  try {
    const cleanCookie = await convertCookie(cookie);
    const id = await getPostID(url);
    const accessToken = await getAccessToken(cleanCookie);

    if (!id) throw new Error("Maling URL o baka naka-private ang post.");
    if (!accessToken) throw new Error("Invalid AppState o Cookie. Hindi makakuha ng token.");

    // Simulan ang session sa Map
    total.set(id, { 
      url, 
      id, 
      count: 0, 
      target: parseInt(amount), 
      startTime: Date.now(),
      status: "Running"
    });

    // --- EXECUTION LOGIC ---
    let timer;
    if (isTurbo) {
      // TURBO MODE: 100 shares kada 1 segundo
      timer = setInterval(async () => {
        const currentSession = total.get(id);
        if (!currentSession || currentSession.count >= amount) {
          stopSession(id);
          return;
        }

        // Loop ng 100 requests sabay-sabay
        for (let i = 0; i < 100; i++) {
          if (currentSession.count < amount) {
            runShareRequest(id, accessToken, cleanCookie);
          }
        }
      }, 1000);
    } else {
      // NORMAL MODE: Depende sa piniling segundo
      timer = setInterval(() => {
        const currentSession = total.get(id);
        if (!currentSession || currentSession.count >= amount) {
          stopSession(id);
          return;
        }
        runShareRequest(id, accessToken, cleanCookie);
      }, parseInt(interval) * 1000);
    }

    timers.set(id, timer);
    res.status(200).json({ status: 200, id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', (req, res) => {
  const { id } = req.body;
  if (id) {
    stopSession(id);
    return res.json({ status: 200, message: `Stopped session ${id}` });
  }
  // Stop all
  timers.forEach((t, k) => clearInterval(t));
  timers.clear();
  total.clear();
  res.json({ status: 200, message: 'Lahat ng sessions ay itinigil na.' });
});

// --- HELPER FUNCTIONS ---

async function runShareRequest(id, token, cookie) {
  try {
    const res = await axios.post(
      `https://graph.facebook.com/me/feed?link=https://m.facebook.com/${id}&published=0&access_token=${token}`, 
      {}, 
      { headers: { 'cookie': cookie } }
    );
    
    if (res.status === 200) {
      const curr = total.get(id);
      if (curr) {
        curr.count++;
        allShares.push({ id, time: Date.now() }); // Dagdag sa global history
      }
    }
  } catch (e) {
    // Kapag nag-error (halimbawa na-block), ituloy lang o hayaang mag-stop ang timer
  }
}

function stopSession(id) {
  if (timers.has(id)) {
    clearInterval(timers.get(id));
    timers.delete(id);
  }
  const session = total.get(id);
  if (session) session.status = "Completed";
}

async function getPostID(url) {
  try {
    const res = await axios.post('https://id.traodoisub.com/api.php', `link=${encodeURIComponent(url)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return res.data.id;
  } catch { return null; }
}

async function getAccessToken(cookie) {
  try {
    const headers = {
      'authority': 'business.facebook.com',
      'cookie': cookie,
      'referer': 'https://www.facebook.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebkit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    };
    const res = await axios.get('https://business.facebook.com/content_management', { headers });
    const token = res.data.match(/"accessToken":\s*"([^"]+)"/);
    return token ? token[1] : null;
  } catch { return null; }
}

async function convertCookie(cookie) {
  return new Promise((resolve, reject) => {
    try {
      const cookies = JSON.parse(cookie);
      const sb = cookies.find(c => c.key === "sb");
      if (!sb) return reject("Invalid AppState format.");
      const fullCookie = cookies.map(c => `${c.key}=${c.value}`).join('; ');
      resolve(fullCookie);
    } catch {
      // Kung hindi JSON, ibalik yung raw string (asumming raw cookie string ito)
      resolve(cookie);
    }
  });
}

app.listen(PORT, () => {
  console.log(`====================================`);
  console.log(`   SYSTEM OPERATIONAL ON PORT ${PORT}`);
  console.log(`====================================`);
});
