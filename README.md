# Devkansh Interior V102 — Google Drive Live Cloud

V102 is the complete cloud-storage build of the Devkansh Interior client/admin application.

## Cloud architecture

**Browser / Android PWA → Vercel API → Google OAuth → Google Drive**

Online mode uses Google Drive as the source of truth for application data and uploaded media. Browser localStorage is not the online database.

## Included cloud features

- Client directory and secure client login
- Admin login with server-side session
- Client budgets, expenses, vendors, documents and gallery metadata
- Reference Design categories and uploads
- Video ID registration/login using mobile number + password
- Video profile photo and video/photo posts
- Maximum 30-second video validation
- Google Drive resumable uploads for large media
- Google Drive file delivery with signed URLs
- Automatic Drive subfolders for upload categories
- `/api/health` connection check
- Google OAuth authorization endpoint

## Important

The Google OAuth refresh token and client secret stay only in Vercel Environment Variables.

See `GOOGLE_DRIVE_SETUP.md` for the exact setup steps.
