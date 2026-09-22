const { google } = require('googleapis');

function normalizePrivateKey(value) {
  let key = String(value || '').trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  key = key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const start = key.indexOf('-----BEGIN PRIVATE KEY-----');
  const endMarker = '-----END PRIVATE KEY-----';
  const end = key.indexOf(endMarker);
  if (start >= 0 && end >= 0) key = key.slice(start, end + endMarker.length);
  return key.trim();
}

function hasOAuthConfig() {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  );
}

function getAuth() {
  // Production/personal Google Drive: use the human owner's OAuth refresh token.
  // This is preferred whenever all OAuth credentials are configured.
  if (hasOAuthConfig()) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI || undefined
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    });
    return oauth2Client;
  }

  // If OAuth client credentials exist but the refresh token is missing, fail
  // explicitly instead of silently falling back to a service account.
  if (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_SECRET || process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error('Google OAuth is incomplete. Add GOOGLE_OAUTH_REFRESH_TOKEN after completing Google authorization.');
  }

  // Backward-compatible fallback for a Google Workspace Shared Drive using
  // a service account. Personal My Drive should use OAuth instead.
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error(
      'Google Drive is not configured. Add GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REFRESH_TOKEN for personal Google Drive.'
    );
  }
  return new google.auth.JWT({
    email: clientEmail.trim(),
    key: normalizePrivateKey(privateKey),
    scopes: ['https://www.googleapis.com/auth/drive']
  });
}

async function getAccessToken() {
  const auth = getAuth();
  const result = await auth.getAccessToken();
  return result?.token || null;
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

async function getVaultFolderId(drive) {
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) return process.env.GOOGLE_DRIVE_FOLDER_ID;

  const names = [
    'Devkansh Interior Client Vault',
    'Devkansh Interior Project Vault',
    'Devkansh Interior project Vault'
  ];

  for (const name of names) {
    const q = [
      "mimeType = 'application/vnd.google-apps.folder'",
      'trashed = false',
      `name = '${name.replace(/'/g, "\\'")}'`
    ].join(' and ');

    const r = await drive.files.list({
      q,
      fields: 'files(id,name)',
      pageSize: 10,
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });

    if (r.data.files && r.data.files.length) return r.data.files[0].id;
  }

  throw new Error(
    'Devkansh Interior Drive folder was not found. Set GOOGLE_DRIVE_FOLDER_ID to the folder ID from your Google Drive.'
  );
}

async function findDataFile(drive, folderId) {
  const q = [
    "mimeType = 'application/json'",
    'trashed = false',
    `'${folderId}' in parents`,
    "name = 'devkansh-vault-data.json'"
  ].join(' and ');

  const r = await drive.files.list({
    q,
    fields: 'files(id,name)',
    pageSize: 10,
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });

  return r.data.files && r.data.files[0] ? r.data.files[0] : null;
}

async function isFileInFolderTree(drive, fileId, rootFolderId) {
  let currentId = fileId;
  const seen = new Set();
  for (let depth = 0; depth < 20 && currentId && !seen.has(currentId); depth++) {
    seen.add(currentId);
    const r = await drive.files.get({fileId: currentId, fields:'id,parents,trashed,mimeType', supportsAllDrives:true});
    if (currentId === rootFolderId) return true;
    const parents = r.data.parents || [];
    if (parents.includes(rootFolderId)) return true;
    currentId = parents[0] || null;
  }
  return false;
}

async function getOrCreateFolderPath(drive, parentId, pathValue) {
  const parts = String(pathValue || '').split('/').map(x => x.trim()).filter(Boolean).map(x => x.replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,100));
  let parent = parentId;
  for (const name of parts) {
    const q = [
      "mimeType = 'application/vnd.google-apps.folder'",
      'trashed = false',
      `'${parent}' in parents`,
      `name = '${name.replace(/'/g, "\\'")}'`
    ].join(' and ');
    const found = await drive.files.list({q,fields:'files(id,name)',pageSize:10,spaces:'drive',includeItemsFromAllDrives:true,supportsAllDrives:true});
    if (found.data.files && found.data.files[0]) parent = found.data.files[0].id;
    else {
      const created = await drive.files.create({requestBody:{name,mimeType:'application/vnd.google-apps.folder',parents:[parent]},fields:'id,name',supportsAllDrives:true});
      parent = created.data.id;
    }
  }
  return parent;
}

function getStorageMode() {
  const oauthClientPartiallyConfigured =
    !!process.env.GOOGLE_OAUTH_CLIENT_ID || !!process.env.GOOGLE_OAUTH_CLIENT_SECRET || !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (hasOAuthConfig()) return 'oauth';
  if (oauthClientPartiallyConfigured) return 'oauth_incomplete';
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) return 'service_account';
  return 'not_configured';
}

module.exports = {
  getAuth,
  getAccessToken,
  getDrive,
  getVaultFolderId,
  findDataFile,
  getOrCreateFolderPath,
  isFileInFolderTree,
  getStorageMode
};
