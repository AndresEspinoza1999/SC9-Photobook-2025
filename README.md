# Photobook 2025

Photobook 2025 is a lightweight Firebase-backed gallery that lets people upload photos for each month of the year. Images are stored in Firebase Storage and metadata lives in Firestore. The homepage combines the upload form and a live-updating gallery for all 12 months.

## Project structure

- `index.html` – Upload form + 12-month gallery
- `styles.css` – Minimal, responsive styling
- `app.js` – Firebase initialization, upload handling, and gallery rendering
- `firebase-config.example.js` – Copy to `firebase-config.js` with your Firebase project keys for local dev or GitHub Pages
- `firebase.json` – Hosting configuration and rule references (if you also deploy to Firebase Hosting)
- `firestore.rules` – Basic Firestore read/write rules for the `photos` collection
- `storage.rules` – Storage rules for the `photos/{month}/{filename}` bucket

## Firebase setup

1. Create a Firebase project and enable Firestore and Storage.
2. Copy `firebase-config.example.js` to `firebase-config.js` and fill in your Firebase config values. These keys are safe to publish in client-only apps.
3. For Firebase Hosting deployments, run:

```bash
firebase deploy --only hosting,firestore,storage
```

## GitHub Pages

Photobook 2025 is now structured to run directly from the repository root (or a `/docs` folder, if you prefer). To deploy on GitHub Pages:

1. Ensure `firebase-config.js` contains your Firebase settings (or add a different config file via another `<script>` tag before `app.js`).
2. Push to your default branch and enable GitHub Pages from that branch and folder (root or `docs`).
3. All asset paths are relative, so the site works whether it is served from `https://<user>.github.io/<repo>/` or a custom domain.

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
