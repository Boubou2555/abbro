/**
 * Netlify Function entry point.
 * Wraps the same shared routes.js (and Turso db.js) used by server.js,
 * so the Netlify-hosted site and any local/other deployment share one
 * database and one set of business logic.
 *
 * netlify.toml rewrites /api/* -> /.netlify/functions/api/:splat, so this
 * function is mounted at that same base path.
 */

const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const itemsRouter = require('../../routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/.netlify/functions/api', itemsRouter);

module.exports.handler = serverless(app);
