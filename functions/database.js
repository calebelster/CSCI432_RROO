// Server-side helper for database access.
// This file initializes the Firebase Admin SDK (when configured) and
// exports a Firestore `db` instance for server-side code.

import admin from 'firebase-admin';

// Initialize admin using either a base64-encoded service account JSON
// in `FIREBASE_SERVICE_ACCOUNT` (preferred for CI/CD) or rely on the
// environment variable `GOOGLE_APPLICATION_CREDENTIALS` pointing to a
// service account JSON file. If neither is present, admin will not be
// initialized (useful for local dev where you might not run server code).

function initAdmin() {
    if (admin.apps.length) return; // already initialized

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
            const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
            const serviceAccount = JSON.parse(json);
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
            console.log('Firebase admin initialized from FIREBASE_SERVICE_ACCOUNT');
        } catch (err) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
        }
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Let the SDK pick up credentials from the provided path
        try {
            admin.initializeApp();
            console.log('Firebase admin initialized using GOOGLE_APPLICATION_CREDENTIALS');
        } catch (err) {
            console.error('Failed to initialize Firebase admin:', err);
        }
    } else {
        console.warn('Firebase admin not initialized: no service account provided');
    }
}

initAdmin();

const db = admin.apps.length ? admin.firestore() : null;

export { admin, db };

// Example helper (uncomment and adapt for your server functions):
// export async function getCommittees() {
//   if (!db) throw new Error('Firestore not initialized on server');
//   const snaps = await db.collection('committees').get();
//   return snaps.docs.map(d => ({ id: d.id, ...d.data() }));
// }