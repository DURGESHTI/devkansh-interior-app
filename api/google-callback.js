const { google } = require('googleapis');
const crypto = require('crypto');

function getConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    'https://devkansh-interior-app.vercel.app/api/google-callback';
  if (!clientId || !clientSecret) throw new Error('Google OAuth client credentials are not configured.');
  return { clientId, clientSecret, redirectUri };
}

function verifyState(state) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || !state) return false;
  const parts = String(state).split('.');
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac('sha256', sessionSecret).update(parts[0]).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(parts[1], 'utf8'), Buffer.from(expected, 'utf8'));
  } catch (_) {
    return false;
  }
}

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  return Object.fromEntries(raw.split(';').map(x => x.trim()).filter(Boolean).map(x => {
    const i = x.indexOf('=');
    return i < 0 ? [x, ''] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
  }));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

module.exports = async function googleCallback(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { clientId, clientSecret, redirectUri } = getConfig();
    const code = req.query.code;
    const state = req.query.state;
    const oauthError = req.query.error;
    const cookies = parseCookies(req);
    const stateCookie = cookies.google_oauth_state;

    if (oauthError) return res.status(400).send('<h2>Google OAuth cancelled</h2><p>Google Drive authorization was cancelled.</p>');
    if (!code) return res.status(400).send('<h2>OAuth Error</h2><p>Authorization code was not received.</p>');
    if (!verifyState(state) || !stateCookie || stateCookie !== state) {
      return res.status(400).send('<h2>OAuth Error</h2><p>Invalid or expired OAuth state.</p>');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      return res.status(400).send('<h2>Google OAuth Error</h2><p>No refresh token was returned. Revoke the existing authorization and authorize again with consent.</p>');
    }

    const refreshToken = tokens.refresh_token;
    res.setHeader('Set-Cookie', 'google_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');

    return res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Devkansh Interior - Google Drive Connected</title><style>body{font-family:Arial,sans-serif;padding:30px;line-height:1.6;background:#f5f5f5}.box{max-width:800px;margin:auto;background:#fff;padding:25px;border-radius:12px}textarea{width:100%;min-height:150px;padding:12px;box-sizing:border-box}button{padding:12px 20px;margin-top:10px;cursor:pointer}.warning{color:#b00020;font-weight:bold}</style></head><body><div class="box"><h2>✅ Google Drive Authorization Successful</h2><p>Devkansh Interior is authorized to use the selected Google Drive account.</p><h3>GOOGLE_OAUTH_REFRESH_TOKEN</h3><textarea id="token" readonly>${escapeHtml(refreshToken)}</textarea><br><button onclick="copyToken()">COPY REFRESH TOKEN</button><p class="warning">⚠️ Keep this token private. Do not send it in chat, WhatsApp, screenshots, GitHub, or browser code.</p><p>Add it to Vercel → Project → Settings → Environment Variables as <b>GOOGLE_OAUTH_REFRESH_TOKEN</b>, then redeploy.</p><script>function copyToken(){const t=document.getElementById('token');t.select();document.execCommand('copy');alert('Refresh token copied. Add it to Vercel.');}</script></div></body></html>`);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return res.status(500).json({ error: error.message || 'Google OAuth callback failed.' });
  }
};
