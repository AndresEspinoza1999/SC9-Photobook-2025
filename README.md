# Photobook 2025

Photobook 2025 is a lightweight Firebase-backed gallery that lets people upload photos for each month of the year. Images are stored in Firebase Storage and metadata lives in Firestore. The homepage combines the upload form and a live-updating gallery for all 12 months.

## Project structure

- `public/` – Static assets served by Firebase Hosting
  - `index.html` – Upload form + 12-month gallery
  - `styles.css` – Minimal, responsive styling
  - `app.js` – Firebase initialization, upload handling, and gallery rendering
- `firebase.json` – Hosting configuration and rule references
- `firestore.rules` – Basic Firestore read/write rules for the `photos` collection
- `storage.rules` – Storage rules for the `photos/{month}/{filename}` bucket

## Firebase setup

1. Create a Firebase project and enable Firestore and Storage.
2. Update `public/app.js` with your Firebase config values (or provide them via Vite-style `import.meta.env` variables at build time).
3. Deploy hosting and rules:

```bash
firebase deploy --only hosting,firestore,storage
```

## How it works

- Users pick a month, optionally add photographer + notes, and select an image file.
- The image uploads to `photos/<month>/<timestamp>-<filename>` in Firebase Storage.
- Metadata (month, notes, photographer, filename, downloadURL, timestamp) is added to Firestore.
- The gallery subscribes to Firestore and renders images newest-first in each month section. Empty months show a friendly placeholder.

## Optional improvements

- Add authentication to limit who can upload.
- Add client-side image compression before upload.
- Add pagination or infinite scroll for months with many photos.
- Move validation into a Cloud Function if you need stricter server-side checks.
