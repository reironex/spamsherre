const axios = require('axios');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { cookie, url, accessToken, id, mode } = JSON.parse(event.body);

    // MODE: INIT - Kukuha ng Token at ID
    if (mode === "init") {
      let formattedCookie = cookie;
      try {
        const json = JSON.parse(cookie);
        formattedCookie = json.map(c => `${c.key}=${c.value}`).join('; ');
      } catch (e) { }

      const idRes = await axios.post('https://id.traodoisub.com/api.php', `link=${encodeURIComponent(url)}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      const tokenRes = await axios.get('https://business.facebook.com/content_management', { 
        headers: { 'cookie': formattedCookie } 
      });
      
      const tokenMatch = tokenRes.data.match(/"accessToken":\s*"([^"]+)"/);
      if (!tokenMatch) throw new Error("Failed to fetch Access Token. Check your Cookie.");

      return {
        statusCode: 200,
        body: JSON.stringify({ id: idRes.data.id, accessToken: tokenMatch[1], cookie: formattedCookie })
      };
    }

    // MODE: SHARE - Ang server na ang mag-sesend sa FB
    if (mode === "share") {
      await axios.post(
        `https://graph.facebook.com/v18.0/me/feed?link=https://facebook.com/${id}&published=0&access_token=${accessToken}`,
        {},
        { 
          headers: { 
            'cookie': cookie,
            'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5)'
          } 
        }
      );
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

  } catch (err) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: err.response?.data?.error?.message || err.message }) 
    };
  }
};
