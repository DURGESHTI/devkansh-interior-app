const { setSession, clearSession, isAdmin, unauthorized, getCredentials } = require('./_auth');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ authenticated: isAdmin(req) });
    }
    if (req.method === 'DELETE') {
      clearSession(res);
      return res.status(200).json({ ok: true });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    const { username, password } = body || {};
    const creds = getCredentials();
    if (username !== creds.username || password !== creds.password) return unauthorized(res);

    setSession(res, username);
    return res.status(200).json({ ok: true, username });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Authentication failed.' });
  }
};
