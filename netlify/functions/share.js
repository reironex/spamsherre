const axios = require('axios');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const { cookie, url } = JSON.parse(event.body);

  try {
    // Convert Cookie
    let formattedCookie = cookie;
    try {
      const json = JSON.parse(cookie);
      formattedCookie = json.map(c => `${c.key}=${c.value}`).join('; ');
    } catch (e) { }

    // Get Post ID
    const idRes = await axios.post('https://id.traodoisub.com/api.php', `link=${encodeURIComponent(url)}`, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const id = idRes.data.id;

    // Get Access Token
    const tokenRes = await axios.get('https://business.facebook.com/content_management', { 
      headers: { 'cookie': formattedCookie } 
    });
    const accessToken = tokenRes.data.match(/"accessToken":\s*"([^"]+)"/)[1];

    if (!id || !accessToken) throw new Error("Invalid Link or AppState");

    return {
      statusCode: 200,
      body: JSON.stringify({ id, accessToken, cookie: formattedCookie })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
