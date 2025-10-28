module.exports = async function handler(req, res) {
  try {
    // Parse cookies manually
    const cookies = {};
    if (req.headers.cookie) {
      req.headers.cookie.split(';').forEach(cookie => {
        const parts = cookie.trim().split('=');
        cookies[parts[0]] = parts[1];
      });
    }

    const userDataCookie = cookies.userData;

    if (!userDataCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Decode base64 session data
    const sessionDataJson = Buffer.from(userDataCookie, 'base64').toString('utf8');
    const sessionData = JSON.parse(sessionDataJson);
    
    const { userId, email, name, picture, spreadsheetId } = sessionData;

    return res.json({
      userId,
      email,
      name,
      picture,
      spreadsheetId
    });
  } catch (error) {
    console.error('User endpoint error:', error);
    return res.status(500).json({ error: error.message });
  }
}
