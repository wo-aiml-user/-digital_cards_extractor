import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Manual cookie parser middleware
app.use((req, res, next) => {
  req.cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      req.cookies[parts[0]] = parts[1];
    });
  }
  next();
});

// Simple in-memory session store (use Redis in production)
const sessions = new Map();

// OAuth configuration
const REDIRECT_URI = process.env.NODE_ENV === 'production' 
  ? 'https://digital-cards-extractor.vercel.app/api/oauth2callback'
  : 'http://localhost:3001/api/oauth2callback';

const oauth2Client = new google.auth.OAuth2(
  '1062550229129-81opr2ult1q4a3a6ummg9ooil14l35l8.apps.googleusercontent.com',
  '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',
  REDIRECT_URI
);

// OAuth Routes
app.get('/api/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });

  res.redirect(authUrl);
});

app.get('/api/oauth2callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('No authorization code provided');
    }

    // Create a new OAuth client for this request
    const client = new google.auth.OAuth2(
      '1062550229129-81opr2ult1q4a3a6ummg9ooil14l35l8.apps.googleusercontent.com',
      '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',
      REDIRECT_URI
    );

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessions.set(sessionId, {
      userId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      tokens: tokens
    });

    // Create user's personal Google Sheet
    const sheets = google.sheets({ version: 'v4', auth: client });
    const drive = google.drive({ version: 'v3', auth: client });

    // Check if spreadsheet already exists for this user
    const spreadsheetName = 'cards_details';
    const fileList = await drive.files.list({
      q: `name='${spreadsheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      fields: 'files(id, name)',
    });

    let spreadsheetId;
    if (fileList.data.files && fileList.data.files.length > 0) {
      spreadsheetId = fileList.data.files[0].id;
    } else {
      // Create new spreadsheet for this user
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

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:I1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Name', 'Company', 'Job Title', 'Email', 'Phone', 'Website', 'Address', 'Social Links', 'Timestamp']],
        },
      });
    }

    // Store spreadsheet ID in session
    const session = sessions.get(sessionId);
    session.spreadsheetId = spreadsheetId;

    // Redirect to frontend with session ID as cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    
    res.redirect(process.env.FRONTEND_URL || 'https://digital-cards-extractor.vercel.app');
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Middleware to verify session
function verifySession(req, res, next) {
  const sessionId = req.cookies.sessionId;
  
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  req.session = sessions.get(sessionId);
  next();
}

// Get user info endpoint
app.get('/api/user', verifySession, (req, res) => {
  const { userId, email, name, picture, spreadsheetId } = req.session;
  res.json({
    userId,
    email,
    name,
    picture,
    spreadsheetId
  });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.clearCookie('sessionId');
  res.json({ success: true });
});

// Google Sheets API setup
const SERVICE_ACCOUNT_FILE = path.join(__dirname, '..', 'service_account.json');
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive'
];

let sheetsClient = null;
let driveClient = null;

// Initialize Google Sheets client
function initializeSheetsClient() {
  try {
    const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_FILE, 'utf8'));
    
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: SCOPES,
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    driveClient = google.drive({ version: 'v3', auth });
    console.log('Google Sheets client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Google Sheets client:', error.message);
  }
}

// Initialize on startup
initializeSheetsClient();

// Save cards to Google Sheets endpoint (requires authentication)
app.post('/api/save-to-sheets', verifySession, async (req, res) => {
  try {
    const { cards } = req.body;

    if (!cards || cards.length === 0) {
      return res.status(400).json({ error: 'No cards provided' });
    }

    if (!req.session || !req.session.spreadsheetId || !req.session.tokens) {
      return res.status(500).json({ error: 'User session not found' });
    }

    // Recreate OAuth client from session tokens
    const client = new google.auth.OAuth2(
      '1062550229129-81opr2ult1q4a3a6ummg9ooil14l35l8.apps.googleusercontent.com',
      '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',
      REDIRECT_URI
    );
    client.setCredentials(req.session.tokens);
    
    const sheets = google.sheets({ version: 'v4', auth: client });
    const spreadsheetId = req.session.spreadsheetId;

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
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    sheetsClientInitialized: sheetsClient !== null,
    googleApiConfigured: !!process.env.GOOGLE_API_KEY
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
