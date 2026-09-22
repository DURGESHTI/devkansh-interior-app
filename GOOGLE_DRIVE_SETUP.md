# Devkansh Interior V102 — Google Drive Cloud Storage

This build is designed so the **online website uses Google Drive as the file/data source** through the Vercel server API.

## Architecture

Browser / Android PWA → Vercel API → Google OAuth → Your Google Drive

### Stored in Google Drive
- `devkansh-vault-data.json` — clients, client login data, budgets, expenses, vendors, projects, finance, daily updates metadata, reference designs, video profiles and video post metadata.
- Uploaded photos, PDFs and videos — stored as Drive files.
- Uploads are organized into Drive subfolders such as `Reference Design`, `Videos`, `Project Gallery`, `Daily Updates`, `Vendors`, `Documents`, `Showcase`, and `Budget Bills`.

## Vercel Environment Variables

Add these to the **new `devkansh-interior-app` Vercel project**, not the old website:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` = `https://devkansh-interior-app.vercel.app/api/google-callback`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `PUBLIC_FILE_SECRET`

## Google OAuth

1. Deploy this project to Vercel.
2. In Google Cloud OAuth credentials, add this exact redirect URI:
   `https://devkansh-interior-app.vercel.app/api/google-callback`
3. Open:
   `https://devkansh-interior-app.vercel.app/api/google-auth`
4. Authorize the Google account that owns the Drive storage.
5. The callback displays `GOOGLE_OAUTH_REFRESH_TOKEN` once.
6. Copy that token into the new Vercel project's Environment Variables.
7. Redeploy.
8. Check:
   `https://devkansh-interior-app.vercel.app/api/health`

The health endpoint should report `"ok":true`, `"storageMode":"oauth"` and the configured Drive folder name.

## Security

Never put `GOOGLE_OAUTH_REFRESH_TOKEN` or `GOOGLE_OAUTH_CLIENT_SECRET` in `index.html`, GitHub, WhatsApp, screenshots or the Android app.

## Admin

The admin username/password are server-side Vercel variables. The browser does not contain the admin password.
