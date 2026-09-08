/**
 * Vercel serverless function entry point.
 *
 * Vercel's Node.js runtime accepts a plain Express app as the export
 * (it is just a (req, res) function under the hood), so we reuse the
 * exact same routes.js + db.js (Turso/libSQL) that server.js (local/Render)
 * and the Netlify function use. One codebase, one database, three hosts.
 *
 * The filename "[...all].js" is Vercel's catch-all route syntax, so this
 * single function handles every request under /api/* (e.g. /api/items,
 * /api/items/5, /api/health).
 *
 * IMPORTANT: this project also needs TURSO_DATABASE_URL and
 * TURSO_AUTH_TOKEN set as Environment Variables in the Vercel project
 * settings (Settings -> Environment Variables), or every request here
 * will fail with "TURSO_DATABASE_URL is not set".
 */

const express = require('express');
const cors = require('cors');
const itemsRouter = require('../routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', itemsRouter);

module.exports = app;
