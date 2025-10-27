const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];

// Initialize Google Sheets client
function initializeSheetsClient() {
  try {
    // Parse service account from environment variable
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: SCOPES,
    });

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const driveClient = google.drive({ version: 'v3', auth });
    
    return { sheetsClient, driveClient };
  } catch (error) {
    console.error('Failed to initialize Google Sheets client:', error.message);
    throw error;
  }
}

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
    const { cards } = req.body;

    if (!cards || cards.length === 0) {
      return res.status(400).json({ error: 'No cards provided' });
    }

    const { sheetsClient, driveClient } = initializeSheetsClient();

    const spreadsheetName = 'cards_details';
    
    // Find or create spreadsheet
    let spreadsheetId;
    
    const fileList = await driveClient.files.list({
      q: `name='${spreadsheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (fileList.data.files && fileList.data.files.length > 0) {
      spreadsheetId = fileList.data.files[0].id;
    } else {
      // Create new spreadsheet
      const createResponse = await sheetsClient.spreadsheets.create({
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

      // Add headers
      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:I1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Name', 'Company', 'Job Title', 'Email', 'Phone', 'Website', 'Address', 'Social Links', 'Timestamp']],
        },
      });
    }

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
    await sheetsClient.spreadsheets.values.append({
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
