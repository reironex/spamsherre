const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();

const ADMIN_USER = "admin";
const ADMIN_PASS = "supersecret123"; 

let announcement = { message: "", updatedAt: null };

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/announcement', (req, res) => res.json(announcement));
app.post('/api/announcement', (req, res) => {
  const { username, password, message } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(401).json({ error: "Unauthorized" });
  announcement = { message, updatedAt: Date.now() };
  res.json({ status: 200, message: "Announcement updated" });
});

const allShares = []; 
const total = new Map();      
const timers = new Map();     

app.get('/total', (req, res) => {
  const data = Array.from(total.values()).map((link, index) => ({
    session: index + 1,
    url: link.url,
    id: link.id,
    count: link.count,
    target: link.target,
    startTime: link.startTime,
    status: link.status
  }));
  res.json(data);
});

app.get('/shares', (req, res) => res.json(allShares));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/submit', async (req, res) => {
  const { cookie, url, amount, interval } = req.body;
  if (!cookie || !url || !amount || !interval) return res.status(400).json({ error: 'Missing fields' });

  try {
    const cookies = await convertCookie(cookie);
    const id = await getPostID(url);
    const accessToken = await getAccessToken(cookies);

    if (!id || !accessToken) throw new Error("Invalid Link or AppState");

    total.set(id, { url, id, count: 0, target: amount, startTime: Date.now(), status: "running" });
    
    // START SHARING LOGIC
    const timer = setInterval(async () => {
      const session = total.get(id);
      if (!session || session.count >= amount) {
        clearInterval(timers.get(id));
        if(session) session.status = "completed";
        return;
      }

      try {
        await axios.post(
          `https://graph.facebook.com/v18.0/me/feed?link=https://facebook.com/${id}&published=0&access_token=${accessToken}`,
          {},
          { headers: { 
              'cookie': cookies,
              'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile'
            } 
          }
        );
        session.count++;
      } catch (error) {
        console.log(`[ERROR] ID ${id}: ${error.response?.data?.error?.message || error.message}`);
        session.status = "failed";
        clearInterval(timers.get(id));
      }
    }, interval); 

    timers.set(id, timer);
    allShares.push({ id, url, time: Date.now() });
    res.status(200).json({ status: 200, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', (req, res) => {
  timers.forEach(t => clearInterval(t));
  timers.clear();
  total.clear();
  res.json({ status: 200, message: 'Stopped all' });
});

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
    const res = await axios.get('https://business.facebook.com/content_management', { headers: { cookie } });
    return res.data.match(/"accessToken":\s*"([^"]+)"/)[1];
  } catch { return null; }
}

async function convertCookie(cookie) {
  try {
    const json = JSON.parse(cookie);
    return json.map(c => `${c.key}=${c.value}`).join('; ');
  } catch { return cookie; }
}

app.listen(5000, () => console.log("Server running on port 5000"));
