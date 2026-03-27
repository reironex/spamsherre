const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const total = new Map();      
const timers = new Map();     

app.get('/total', (req, res) => {
  // Ginawang array para mabasa ng frontend nang tama
  res.json(Array.from(total.values()));
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

    // Kunin ang UID para sa display
    const userRes = await axios.get(`https://graph.facebook.com/me?access_token=${accessToken}`);
    const userUID = userRes.data.id;

    // UNIQUE KEY: UID + ID para kahit same link, hiwalay ang entry
    const sessionKey = `${userUID}_${id}`; 

    total.set(sessionKey, { 
      id, 
      userUID, 
      count: 0, 
      target: amount, 
      status: "running" 
    });
    
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
          { headers: { 
              'cookie': cookies,
              'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5)'
            } 
          }
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
