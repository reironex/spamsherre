const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const total = new Map();      
const timers = new Map();     
const sessionOrder = []; 

app.get('/total', (req, res) => {
  const data = sessionOrder.map((key, index) => {
    const link = total.get(key);
    return {
      session: index + 1,
      id: link.id,
      count: link.count,
      target: link.target,
      status: link.status
    };
  });
  res.json(data);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/submit', async (req, res) => {
  const { cookie, url, amount, interval } = req.body;
  if (!cookie || !url || !amount || !interval) return res.status(400).json({ error: 'Missing fields' });

  try {
    const cookies = await convertCookie(cookie);
    const id = await getPostID(url);
    const accessToken = await getAccessToken(cookies);

    if (!id || !accessToken) throw new Error("Invalid Link or AppState");

    const sessionKey = `${id}_${Date.now()}`; 
    total.set(sessionKey, { id, count: 0, target: amount, status: "running" });
    sessionOrder.push(sessionKey); 
    
    const timer = setInterval(async () => {
      const session = total.get(sessionKey);
      if (!session || session.count >= amount) {
        clearInterval(timers.get(sessionKey));
        if(session) session.status = "completed";
        return;
      }

      try {
        await axios.post(
          `https://graph.facebook.com/v18.0/me/feed?link=https://facebook.com/${id}&published=0&access_token=${accessToken}`,
          {},
          { headers: { 'cookie': cookies, 'User-Agent': 'Mozilla/5.0' } }
        );
        session.count++;
      } catch (error) {
        session.status = "failed";
        clearInterval(timers.get(sessionKey));
      }
    }, interval); 

    timers.set(sessionKey, timer);
    res.status(200).json({ status: 200, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', (req, res) => {
  timers.forEach(t => clearInterval(t));
  timers.clear();
  total.clear();
  sessionOrder.length = 0; 
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
