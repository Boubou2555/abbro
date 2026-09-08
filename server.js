/**
 * Arena Breakout Loot Tracker — local dev / traditional Node hosting entry point.
 *
 * Uses the same routes.js + db.js (Turso/libSQL) as the Netlify function, so
 * local dev, Render, a VPS, etc. all read and write the exact same shared
 * cloud database as the deployed Netlify site.
 *
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN — put them in a local
 * .env file (see .env.example) for local runs; on a host like Render, set
 * them as environment variables in the dashboard instead.
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const itemsRouter = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', itemsRouter);

// Fallback to index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎯 Arena Breakout Tracker running at http://localhost:${PORT}`);
  console.log(process.env.TURSO_DATABASE_URL
    ? '📦 Connected to Turso database'
    : '⚠️  TURSO_DATABASE_URL not set — see .env.example / README.md');
});
