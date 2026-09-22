const { getAccessToken, getVaultFolderId, getDrive, getOrCreateFolderPath } = require('./_google');
const { isAdmin, unauthorized } = require('./_auth');
const { getVideoUserId } = require('./_video-auth');

function safeName(name) {
  return String(name || 'upload').replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').slice(0, 180) || 'upload';
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isAdmin(req) && !getVideoUserId(req)) return unauthorized(res);

    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    const filename = safeName(body?.filename);
    const category = String(body?.category || 'Uploads');
    const mimeType = String(body?.mimeType || 'application/octet-stream');
    const size = Number(body?.size);
    if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'Invalid file size.' });

    const drive = getDrive();
    const folderId = await getVaultFolderId(drive);
    const uploadFolderId = await getOrCreateFolderPath(drive, folderId, category);
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Unable to create Google Drive upload session.');

    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(size)
      },
      body: JSON.stringify({ name: filename, parents: [uploadFolderId], mimeType })
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({ error: `Google Drive upload session failed (${r.status}). ${text.slice(0, 500)}` });
    }
    const location = r.headers.get('location');
    if (!location) throw new Error('Google Drive did not return an upload session URL.');

    return res.status(200).json({ ok: true, uploadUrl: location, filename, mimeType, size, category });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Unable to create upload session.' });
  }
};
