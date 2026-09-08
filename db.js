/**
 * Shared database module — Turso (libSQL), works identically in:
 *  - Local dev (server.js, plain Node)
 *  - Netlify Functions (netlify/functions/api.js, serverless)
 *
 * Requires two environment variables (see .env.example / README.md):
 *   TURSO_DATABASE_URL
 *   TURSO_AUTH_TOKEN
 */

const { createClient } = require('@libsql/client');

let client;
let initPromise;

function getClient() {
  if (!client) {
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error(
        'TURSO_DATABASE_URL is not set. Create a free database at turso.tech and set ' +
        'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN as environment variables (see README.md).'
      );
    }
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });
  }
  return client;
}

async function initDb() {
  if (!initPromise) {
    initPromise = getClient().execute(`
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
    `);
  }
  return initPromise;
}

module.exports = { getClient, initDb };
