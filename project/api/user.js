// In-memory session store (use a database in production)
// Note: This should be shared across all serverless functions
const sessions = {};

export default async function handler(req, res) {
  try {
    const sessionId = req.cookies?.sessionId || req.headers.cookie?.match(/sessionId=([^;]+)/)?.[1];

    if (!sessionId || !sessions[sessionId]) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const session = sessions[sessionId];
    const { userId, email, name, picture, spreadsheetId } = session;

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
