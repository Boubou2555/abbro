/**
 * Shared database module — Turso (libSQL).
 *
 * IMPORTANT: we deliberately import "@libsql/client/web" instead of the
 * default "@libsql/client" entry point.
 *
 * The default entry point tries to load platform-specific native binaries
 * (e.g. "@libsql/linux-x64-gnu") to support a *local* embedded SQLite file.
 * Those binaries don't reliably survive being bundled into a serverless
 * function (Netlify/Vercel/etc.), which crashes with:
 *   "Cannot find module '@libsql/linux-x64-gnu'"
 *
 * "@libsql/client/web" is pure JavaScript — it talks to Turso purely over
 * HTTP (using fetch, available natively in Node 18+), needs zero native
 * binaries, and works identically in Node, Netlify Functions, and edge
 * runtimes. It only supports remote libsql://... / https://... URLs, which
 * is exactly what this project uses (a hosted Turso database), so there is
 * no functional trade-off here.
 *
 * Requires two environment variables (see .env.example / README.md):
 *   TURSO_DATABASE_URL
 *   TURSO_AUTH_TOKEN
 */

let clientPromise;
let initPromise;

async function getClient() {
  if (!clientPromise) {
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error(
        'TURSO_DATABASE_URL is not set. Create a free database at turso.tech and set ' +
        'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN as environment variables (see README.md).'
      );
    }
    clientPromise = import('@libsql/client/web').then(({ createClient }) =>
      createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
      })
    );
  }
  return clientPromise;
}

async function initDb() {
  if (!initPromise) {
    initPromise = getClient().then((client) =>
      client.execute(`
        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          name_ar TEXT,
          image_url TEXT,
          price INTEGER DEFAULT 0,
          grid_size INTEGER NOT NULL DEFAULT 1,
          rarity TEXT NOT NULL DEFAULT 'blue',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
    );
  }
  return initPromise;
}

module.exports = { getClient, initDb };
