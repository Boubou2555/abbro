/**
 * Netlify Function entry point.
 * Wraps the same shared routes.js (and Turso db.js) used by server.js,
 * so the Netlify-hosted site and any local/other deployment share one
 * database and one set of business logic.
 *
 * Netlify's redirect behavior for the incoming request path can vary
 * (some setups deliver the original "/api/items", others deliver the
 * rewritten "/.netlify/functions/api/items"). Rather than depend on one
 * specific behavior, we normalize req.url by stripping either known
 * prefix before handing off to the shared router, which only knows about
 * plain paths like "/items" and "/items/:id".
 */

const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const itemsRouter = require('../../routes');

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.url = req.url
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '') || '/';
  next();
});

app.use('/', itemsRouter);

module.exports.handler = serverless(app);
