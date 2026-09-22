const { Readable } = require('stream');
const { getDrive, getVaultFolderId, findDataFile } = require('./_google');
const { isAdmin, unauthorized } = require('./_auth');

function sendError(res, err) {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
}

module.exports = async (req, res) => {
  try {
    if (!isAdmin(req)) return unauthorized(res);
    const drive = getDrive();
    const folderId = await getVaultFolderId(drive);
    const existing = await findDataFile(drive, folderId);

    if (req.method === 'GET') {
      if (!existing) return res.status(200).json({ version: 99, clients: [], budgetClients: [], trash: [], vendors: [], showcase: {}, videos: [], videoUsers: [], videoPosts: [], referenceDesigns: [], projects: [], finance: [] });
      const r = await drive.files.get({ fileId: existing.id, alt: 'media' }, { responseType: 'json' });
      return res.status(200).json(r.data || { version: 3, clients: [], budgetClients: [], trash: [], vendors: [] });
    }

    if (req.method !== 'PUT' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid JSON' });

    const clean = {
      ...body,
      version: 99,
      updatedAt: new Date().toISOString(),
      clients: Array.isArray(body.clients) ? body.clients : [],
      budgetClients: Array.isArray(body.budgetClients) ? body.budgetClients : [],
      trash: Array.isArray(body.trash) ? body.trash : [],
      vendors: Array.isArray(body.vendors) ? body.vendors : [],
      showcase: body.showcase && typeof body.showcase === 'object' ? body.showcase : {},
      videos: Array.isArray(body.videos) ? body.videos : [],
      videoUsers: Array.isArray(body.videoUsers) ? body.videoUsers : [],
      videoPosts: Array.isArray(body.videoPosts) ? body.videoPosts : [],
      referenceDesigns: Array.isArray(body.referenceDesigns) ? body.referenceDesigns : [],
      projects: Array.isArray(body.projects) ? body.projects : [],
      finance: Array.isArray(body.finance) ? body.finance : []
    };
    const media = { mimeType: 'application/json', body: Readable.from([JSON.stringify(clean)]) };
    if (existing) {
      await drive.files.update({ fileId: existing.id, media, fields: 'id,name,modifiedTime', supportsAllDrives: true });
    } else {
      await drive.files.create({
        requestBody: { name: 'devkansh-vault-data.json', parents: [folderId], mimeType: 'application/json' },
        media,
        fields: 'id,name,modifiedTime',
        supportsAllDrives: true
      });
    }
    return res.status(200).json({ ok: true, updatedAt: clean.updatedAt });
  } catch (err) {
    return sendError(res, err);
  }
};
