const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  const oauth2Client = new google.auth.OAuth2(
    '1062550229129-81opr2ult1q4a3a6ummg9ooil14l35l8.apps.googleusercontent.com',
    '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',
    'https://digital-cards-extractor.vercel.app/api/oauth2callback'
  );

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

  return res.redirect(authUrl);
}
