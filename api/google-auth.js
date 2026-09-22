const { google } = require('googleapis');
const crypto = require('crypto');

function getOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    'https://devkansh-interior-app.vercel.app/api/google-callback';

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are not configured.');
  }
  return { clientId, clientSecret, redirectUri };
}

function createSignedState() {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error('SESSION_SECRET is not configured.');
  const randomState = crypto.randomBytes(32).toString('hex');
  const signature = crypto.createHmac('sha256', sessionSecret).update(randomState).digest('hex');
  return `${randomState}.${signature}`;
}

module.exports = async function googleAuth(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { clientId, clientSecret, redirectUri } = getOAuthConfig();
    const state = createSignedState();
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const authorizationUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive'],
      state
    });

    res.setHeader('Set-Cookie',
      `google_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    );
    return res.redirect(302, authorizationUrl);
  } catch (error) {
    console.error('Google OAuth start error:', error);
    return res.status(500).json({ error: error.message || 'Google OAuth start failed.' });
  }
};
