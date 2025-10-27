const { google } = require('googleapis');

// In-memory session store (use a database in production)
// Note: This won't persist across serverless function invocations
const sessions = {};

module.exports = async function handler(req, res) {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('No authorization code provided');
    }

    const oauth2Client = new google.auth.OAuth2(
      '1062550229129-81opr2ult1q4a3a6ummg9ooil14l35l8.apps.googleusercontent.com',
      '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',
      'https://digital-cards-extractor.vercel.app/api/oauth2callback'
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionData = {
      userId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      tokens: tokens,
      createdAt: Date.now()
    };

    // Create user's personal Google Sheet
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const spreadsheetName = 'cards_details';
    const fileList = await drive.files.list({
      q: `name='${spreadsheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id, name)',
    });

    let spreadsheetId;
    if (fileList.data.files && fileList.data.files.length > 0) {
      spreadsheetId = fileList.data.files[0].id;
    } else {
      const createResponse = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: spreadsheetName,
          },
          sheets: [
            {
              properties: {
                title: 'Sheet1',
              },
            },
          ],
        },
      });
      spreadsheetId = createResponse.data.spreadsheetId;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:I1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Name', 'Company', 'Job Title', 'Email', 'Phone', 'Website', 'Address', 'Social Links', 'Timestamp']],
        },
      });
    }

    sessionData.spreadsheetId = spreadsheetId;
    sessions[sessionId] = sessionData;

    // Store session in cookie
    res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Secure; SameSite=None; Max-Age=${30 * 24 * 60 * 60}; Path=/`);
    
    return res.redirect('https://digital-cards-extractor.vercel.app');
  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.status(500).send('Authentication failed: ' + error.message);
  }
}
