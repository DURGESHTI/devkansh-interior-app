const { isAdmin, unauthorized } = require('./_auth');
const { getVideoUserId } = require('./_video-auth');

// IMPORTANT: Vercel must not JSON-parse the binary request body.
// The browser sends raw image/video bytes to this endpoint.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
    });
    req.on('end', () => resolve(Buffer.concat(chunks, total)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
    if (!isAdmin(req) && !getVideoUserId(req)) return unauthorized(res);

    const uploadUrl = String(req.headers['x-upload-url'] || '');
    const contentRange = String(req.headers['content-range'] || '');
    const contentType = String(req.headers['content-type'] || 'application/octet-stream');

    if (!uploadUrl || !/^https:\/\/www\.googleapis\.com\/upload\/drive\//.test(uploadUrl)) {
      return res.status(400).json({ error: 'Invalid Google Drive upload session URL.' });
    }
    if (!/^bytes \d+-\d+\/\d+$/.test(contentRange)) {
      return res.status(400).json({ error: 'Invalid Content-Range.' });
    }

    // With bodyParser disabled, req.body is not used. Read the raw binary stream.
    const body = await readRawBody(req);
    if (!body.length) return res.status(400).json({ error: 'Empty upload chunk.' });

    const r = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(body.length),
        'Content-Type': contentType,
        'Content-Range': contentRange
      },
      body
    });

    if (r.status === 308) {
      const range = r.headers.get('range') || '';
      let nextStart = null;
      const m = range.match(/bytes=(\d+)-(\d+)/);
      if (m) nextStart = Number(m[2]) + 1;
      return res.status(200).json({ ok: true, done: false, nextStart, range });
    }

    const text = await r.text();
    if (!r.ok) {
      return res.status(502).json({ error: `Google Drive chunk upload failed (${r.status}). ${text.slice(0, 500)}` });
    }

    let data = null;
    try { data = JSON.parse(text); } catch {}
    if (!data?.id) return res.status(502).json({ error: 'Google Drive upload completed without a file ID.' });

    return res.status(200).json({ ok: true, done: true, file: data });
  } catch (err) {
    console.error('upload-chunk error:', err);
    return res.status(500).json({ error: err.message || 'Upload chunk failed.' });
  }
};
