const { google } = require('googleapis');

// In-memory session store (use a database in production)
// Note: This won't persist across serverless function invocations
const sessions = {};

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse cookies
    const cookies = {};
    if (req.headers.cookie) {
      req.headers.cookie.split(';').forEach(cookie => {
        const parts = cookie.trim().split('=');
        cookies[parts[0]] = parts[1];
      });
    }

    const userDataCookie = cookies.userData;

    if (!userDataCookie) {
      return res.status(401).json({ error: 'Not authenticated. Please sign in.' });
    }

    // Decode session data from cookie
    const sessionDataJson = Buffer.from(userDataCookie, 'base64').toString('utf8');
    const session = JSON.parse(sessionDataJson);
    
    const { cards } = req.body;

    if (!cards || cards.length === 0) {
      return res.status(400).json({ error: 'No cards provided' });
    }

    // Get user's spreadsheet ID from session
    const spreadsheetId = session.spreadsheetId;

    if (!spreadsheetId) {
      return res.status(500).json({ error: 'User spreadsheet not found' });
    }

    // Get credentials from environment
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Use production domain from environment or fallback
    const redirectUri = process.env.OAUTH_REDIRECT_URI;

    // Recreate OAuth client from session tokens
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    oauth2Client.setCredentials(session.tokens);
    
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Prepare all rows
    const rows = cards.map(card => [
      card.data.name || '',
      card.data.company || '',
      card.data.job_title || '',
      card.data.email || '',
      card.data.phone || '',
      card.data.website || '',
      card.data.address || '',
      Array.isArray(card.data.social_links) ? card.data.social_links.join(', ') : '',
      card.timestamp || new Date().toISOString(),
    ]);

    // Append all cards at once
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:I',
      valueInputOption: 'RAW',
      requestBody: {
        values: rows,
      },
    });

    res.json({ 
      success: true, 
      message: `Saved ${cards.length} card${cards.length > 1 ? 's' : ''} to Google Sheets`,
      spreadsheetId 
    });
  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    res.status(500).json({ error: error.message });
  }
}
