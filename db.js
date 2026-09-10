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
 * Requires two environment variables (see README.md):
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

// Accounts table: each row is one game account for sale.
//   code            — short unique reference code shown to the buyer, so
//                      they can tell the seller which account they want
//                      without needing an account/login system on the site.
//   gems            — عدد الجواهر
//   gold_bars       — عدد الشظايا الذهبية
//   image_url       — صورة الإكستريم (or any cover image), URL or base64 data URL
//   price_usd       — السعر بالدولار
//   price_flexy     — السعر بالدينار الجزائري (فليكسي)
//   price_baridimob — السعر بالدينار الجزائري (BaridiMob)
//   status          — 'available' | 'sold'
async function initDb() {
  if (!initPromise) {
    initPromise = getClient().then(async (client) => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          title TEXT,
          gems INTEGER NOT NULL DEFAULT 0,
          gold_bars INTEGER NOT NULL DEFAULT 0,
          image_url TEXT,
          price_usd REAL NOT NULL DEFAULT 0,
          price_flexy REAL NOT NULL DEFAULT 0,
          price_baridimob REAL NOT NULL DEFAULT 0,
          note TEXT,
          status TEXT NOT NULL DEFAULT 'available',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Best-effort migration for older databases created before a column
      // existed. Each ALTER is wrapped so an "already exists" error from a
      // database that already has the column never blocks startup.
      const migrations = [
        `ALTER TABLE accounts ADD COLUMN title TEXT`,
        `ALTER TABLE accounts ADD COLUMN note TEXT`
      ];
      for (const sql of migrations) {
        try { await client.execute(sql); } catch (_) { /* column already exists */ }
      }

      // Single-row table holding the (hashed) admin password. The password
      // itself is generated randomly on first use and never stored in
      // plaintext or in an environment variable — see routes.js.
      await client.execute(`
        CREATE TABLE IF NOT EXISTS admin_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          password_hash TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
  }
  return initPromise;
}

module.exports = { getClient, initDb };
