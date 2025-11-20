[![Netlify Status](https://api.netlify.com/api/v1/badges/a7b55bf7-fc25-4852-9e52-d2e19e08cd57/deploy-status)](https://app.netlify.com/projects/polite-croissant-816eb9/deploys)

## Firebase setup

This project uses Firebase (Firestore) for data storage and Firebase Auth for authentication.

Quick steps to connect a Firebase project:

- Create a Firebase project at https://console.firebase.google.com/ and enable Firestore and Authentication (Email provider is commonly used).
- In the project settings -> "Your apps" -> add a Web app and copy the config values.
- Create a `.env` file at the project root with the following keys (or copy from `.env.example`):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Frontend (client):
- The client reads these values via Vite `import.meta.env`. After adding `.env`, restart the dev server (`npm run dev`).

Server (admin) usage:
- If you need server-side access (e.g., Netlify functions, Node backend), create a Firebase service account JSON from Project Settings -> Service accounts -> Generate new private key.
- Base64-encode that JSON and set it into your deployment environment under `FIREBASE_SERVICE_ACCOUNT` (or set `GOOGLE_APPLICATION_CREDENTIALS` to a file path containing the JSON when running locally).
- The file `functions/database.js` initializes the Admin SDK and exports `db` for server code.

If you'd like, I can:
- Move the current hard-coded config fully into env vars and remove the fallback values.
- Add example serverless functions that use the Admin SDK to read/write Firestore.
- Configure rules recommendations for Firestore security.

