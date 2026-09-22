const Busboy = require('busboy');
const crypto = require('crypto');
const { Readable } = require('stream');
const { getDrive, getVaultFolderId, isFileInFolderTree } = require('./_google');
const { isAdmin, unauthorized } = require('./_auth');

const MAX_BYTES = 100 * 1024 * 1024;

function publicSecret() {
  const s = process.env.PUBLIC_FILE_SECRET || process.env.SESSION_SECRET;
  if (!s) throw new Error('PUBLIC_FILE_SECRET or SESSION_SECRET is not configured.');
  return s;
}
function validPublicSignature(id, exp, sig) {
  if (!id || !exp || !sig || Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac('sha256', publicSecret()).update(`${id}.${exp}`).digest('base64url');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); } catch (_) { return false; }
}
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES } });
    const chunks = [];
    let fileInfo = null;
    let tooLarge = false;
    bb.on('file', (name, file, info) => {
      fileInfo = { filename: info.filename, mimeType: info.mimeType || 'application/octet-stream' };
      file.on('data', d => chunks.push(d));
      file.on('limit', () => { tooLarge = true; });
    });
    bb.on('error', reject);
    bb.on('finish', () => {
      if (tooLarge) return reject(new Error('File is larger than 100 MB.'));
      if (!fileInfo) return reject(new Error('No file was uploaded.'));
      resolve({ ...fileInfo, buffer: Buffer.concat(chunks) });
    });
    req.pipe(bb);
  });
}

module.exports = async (req, res) => {
  try {
    const drive = getDrive();
    const folderId = await getVaultFolderId(drive);

    if (req.method === 'POST') {
      if (!isAdmin(req)) return unauthorized(res);
      const { filename, mimeType, buffer } = await parseMultipart(req);
      const safeName = filename.replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').slice(0, 180) || 'upload';
      const r = await drive.files.create({
        requestBody: { name: safeName, parents: [folderId], mimeType },
        media: { mimeType, body: Readable.from(buffer) },
        fields: 'id,name,mimeType,size,createdTime',
        supportsAllDrives: true
      });
      return res.status(200).json({ ok: true, id: r.data.id, name: r.data.name, type: r.data.mimeType, size: Number(r.data.size || buffer.length) });
    }

    if (req.method === 'DELETE') {
      if (!isAdmin(req)) return unauthorized(res);
      const id = String(req.query?.id || '');
      if (!id) return res.status(400).json({ error: 'Missing file id' });
      const meta = await drive.files.get({ fileId: id, fields: 'id,name,parents,trashed', supportsAllDrives: true });
      const parents = meta.data.parents || [];
      if (!(await isFileInFolderTree(drive,id,folderId)) || meta.data.trashed) return res.status(404).json({ error: 'File not found' });
      await drive.files.update({ fileId: id, requestBody: { trashed: true }, supportsAllDrives: true });
      return res.status(200).json({ ok: true, id });
    }

    if (req.method === 'GET') {
      const id = String(req.query?.id || '');
      if (!id) return res.status(400).send('Missing file id');
      const admin = isAdmin(req);
      const signedPublic = !admin && validPublicSignature(id, String(req.query?.exp || ''), String(req.query?.sig || ''));
      if (!admin && !signedPublic) return unauthorized(res);

      const meta = await drive.files.get({ fileId: id, fields: 'id,name,mimeType,size,parents,trashed', supportsAllDrives: true });
      const parents = meta.data.parents || [];
      if (!(await isFileInFolderTree(drive,id,folderId)) || meta.data.trashed) return res.status(404).send('File not found');
      const totalSize = Number(meta.data.size || 0);
      const range = req.headers?.range;
      let requestConfig = { fileId: id, alt: 'media' };
      let requestOptions = { responseType: 'stream' };
      let status = 200;
      if (range && totalSize > 0) {
        const m = /^bytes=(\d*)-(\d*)$/i.exec(String(range).trim());
        if (m) {
          let start = m[1] ? Number(m[1]) : Math.max(0, totalSize - Number(m[2] || 0));
          let end = m[2] ? Number(m[2]) : totalSize - 1;
          if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && start < totalSize) {
            end = Math.min(end, totalSize - 1);
            requestConfig = { fileId: id, alt: 'media' };
            requestOptions.headers = { Range: `bytes=${start}-${end}` };
            status = 206;
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', end - start + 1);
          }
        }
      }
      const r = await drive.files.get(requestConfig, requestOptions);
      res.statusCode = status;
      res.setHeader('Content-Type', meta.data.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.data.name || 'file')}`);
      if (status === 200 && totalSize) { res.setHeader('Content-Length', totalSize); res.setHeader('Accept-Ranges', 'bytes'); }
      r.data.on('error', err => { console.error(err); if (!res.headersSent) res.status(500); res.end(); });
      r.data.pipe(res);
      return;
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'File operation failed' });
  }
};
