# API Documentation — RROO Project

Base path for Netlify functions: /.netlify/functions/<name>

Authentication
- Client must sign up / sign in using Firebase Authentication client SDK.
- Include an ID token in the Authorization header for protected endpoints:
  Authorization: Bearer <ID_TOKEN>
- Server-side functions verify ID tokens using `firebase-admin` initialized with the `FIREBASE_SERVICE_ACCOUNT` JSON stored in the environment.

Common errors
- 400 Bad Request — missing/invalid parameters
- 401 Unauthorized — missing/invalid token (verification failed)
- 403 Forbidden — insufficient permissions
- 404 Not Found — resource not found
- 405 Method Not Allowed — unsupported HTTP method
- 500 Server Error — unexpected server error

## Users API — `/.netlify/functions/users`

POST — Create DB user row (protected)
- Auth: Required (Firebase ID token)
- Body: { display_name?: string }
- Response: 201 { id, uid, display_name, email }
- Errors: 401, 400, 500

GET — List users or fetch by id (public)
- Query: ?id=<id>
- Auth: Not required for listing in this demo
- Response: 200 [ { id, uid, display_name, email } ] or 200 { id, uid, display_name, email }
- Errors: 404

PUT — Update user (owner only)
- Auth: Required
- Body: { id: number, display_name: string }
- Response: 200 { success: true }
- Errors: 400, 401, 403, 404

DELETE — Delete user (owner only)
- Query: ?id=<id>
- Auth: Required
- Response: 200 { success: true }
- Errors: 400, 401, 403, 404

Permissions: Only the owner (Firebase UID matching `users.uid`) can update or delete their record.

## Motions API — `/.netlify/functions/motions`

POST — Create motion (protected)
- Auth: Required
- Body: { title: string, body?: string, committee_id?: number }
- Response: 201 { id, title, body, committee_id, owner_uid, seconded }
- Errors: 400, 401, 500

GET — Get motion or list motions
- Query: ?id=<id> or ?committee_id=<cid>
- Auth: Not required for listing in this demo (adjust in production)
- Response: 200 { motion } or 200 [ motions ]
- Errors: 404

PUT — Update motion (owner only; not allowed if seconded)
- Auth: Required
- Body: { id: number, title?: string, body?: string }
- Response: 200 { success: true }
- Errors: 400, 401, 403, 404

DELETE — Delete motion (owner only; not allowed if seconded)
- Query: ?id=<id>
- Auth: Required
- Response: 200 { success: true }
- Errors: 400, 401, 403, 404

Permissions: Only the owner_uid can edit/delete a motion. Once a motion is `seconded` it cannot be edited or deleted. Extendable: allow committee chairs to edit/delete — implement by adding a `roles` table or `committee_roles` mapping and checking in functions.

## Local testing
- Use Netlify CLI: `netlify dev` to run functions locally.
- Set `FIREBASE_SERVICE_ACCOUNT` env var in your shell to the service account JSON string before running `netlify dev`.
- Functions respond to OPTIONS for CORS preflight and include Access-Control-Allow-* headers.

## DB schema (minimum)
- users(id serial primary key, uid text unique, display_name text, email text)
- motions(id serial primary key, title text, body text, committee_id int, owner_uid text, seconded boolean default false)
