const { getDrive, getVaultFolderId, getStorageMode } = require('./_google');

module.exports = async (req, res) => {
  const oauthRequired = [
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REFRESH_TOKEN',
    'GOOGLE_DRIVE_FOLDER_ID',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD',
    'SESSION_SECRET',
    'PUBLIC_FILE_SECRET'
  ];

  const missing = oauthRequired.filter(k => !process.env[k]);
  const mode = getStorageMode();

  // OAuth is the intended production path. If refresh token is not present yet,
  // report the exact missing variable instead of falsely saying Drive is ready.
  if (mode !== 'oauth') {
    return res.status(200).json({
      ok: false,
      cloudStorage: mode === 'oauth_incomplete' ? 'oauth_not_ready' : 'not_configured',
      storageMode: mode,
      missing
    });
  }

  try {
    const drive = getDrive();
    const folderId = await getVaultFolderId(drive);
    const folder = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType,trashed,driveId',
      supportsAllDrives: true
    });
    const ok = !!folder.data?.id && folder.data?.trashed !== true;
    return res.status(200).json({
      ok,
      cloudStorage: ok ? 'connected' : 'configured',
      storageMode: 'oauth',
      folder: ok ? folder.data.name : null,
      missing: [],
      note: missing.length ? `Missing: ${missing.join(', ')}` : null
    });
  } catch (err) {
    console.error(err);
    return res.status(200).json({
      ok: false,
      cloudStorage: 'configured_but_unreachable',
      storageMode: 'oauth',
      missing: [],
      error: err.message || 'Google Drive connection failed.'
    });
  }
};
