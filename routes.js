/**
 * Shared API routes, mounted:
 *   - at /api                     in server.js (local dev / Render / any Node host)
 *   - at /.netlify/functions/api  in netlify/functions/api.js
 *   - at /api                     in api/[...all].js (Vercel)
 *
 * Public endpoints (no password needed):
 *   GET  /accounts            -> only accounts with status = "available"
 *
 * Admin auth (no ADMIN_PASSWORD env var — password lives only, as a
 * bcrypt hash, in the "admin_settings" table):
 *   GET  /admin/setup-status              -> { configured: boolean }, public
 *   POST /admin/setup                     -> generate + store the password (only works once), returns plaintext once
 *   POST /admin/regenerate-password       -> requires current password, returns new plaintext once
 *
 * Admin endpoints (require header "x-admin-password" to match the
 * stored password):
 *   POST /admin/login                    -> { ok: true } if the password is correct
 *   GET  /admin/accounts                 -> every account, any status
 *   GET  /admin/accounts/search?code=..  -> accounts whose code contains the query
 *   POST /admin/accounts                 -> create account (server generates the code)
 *   PUT  /admin/accounts/:id             -> update account
 *   POST /admin/accounts/:id/regenerate-code -> assign a brand new random code
 *   DELETE /admin/accounts/:id           -> delete account
 */

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getClient, initDb } = require('./db');

const router = express.Router();

const VALID_STATUSES = ['available', 'sold'];

// Characters chosen to avoid visually ambiguous ones (0/O, 1/I/L) since the
// buyer has to read this code back to the seller over chat.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRandomCode(length = 7) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// ---------------------------------------------------------------------
// Admin auth — the admin password is never chosen by hand and never
// lives in an environment variable. It is generated randomly the first
// time /admin/setup is called, hashed with bcrypt, and stored in the
// "admin_settings" table. Only the hash is ever persisted; the plaintext
// password is returned to the caller exactly once (at generation time)
// and cannot be recovered afterwards — only regenerated.
// ---------------------------------------------------------------------
const PASSWORD_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generateRandomPassword(length = 16) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

async function getAdminPasswordHash(client) {
  const result = await client.execute('SELECT password_hash FROM admin_settings WHERE id = 1');
  return result.rows[0] ? result.rows[0].password_hash : null;
}

async function setAdminPasswordHash(client, hash) {
  await client.execute({
    sql: `INSERT INTO admin_settings (id, password_hash, updated_at)
          VALUES (1, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = CURRENT_TIMESTAMP`,
    args: [hash]
  });
}

async function generateAndStoreAdminPassword(client) {
  const plaintext = generateRandomPassword();
  const hash = await bcrypt.hash(plaintext, 10);
  await setAdminPasswordHash(client, hash);
  return plaintext;
}

async function generateUniqueCode(client) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateRandomCode();
    const existing = await client.execute({
      sql: 'SELECT id FROM accounts WHERE code = ?',
      args: [candidate]
    });
    if (!existing.rows.length) return candidate;
  }
  // Astronomically unlikely, but fall back to a longer code so we never hang.
  return generateRandomCode(12);
}

// Some SQLite/libSQL driver configurations can return integer columns as
// BigInt or string instead of a plain Number. Normalize so the frontend can
// safely compare/format them.
function normalizeRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.id !== undefined) out.id = Number(out.id);
  if (out.gems !== undefined) out.gems = Number(out.gems);
  if (out.gold_bars !== undefined) out.gold_bars = Number(out.gold_bars);
  if (out.price_usd !== undefined) out.price_usd = Number(out.price_usd);
  if (out.price_flexy !== undefined) out.price_flexy = Number(out.price_flexy);
  if (out.price_baridimob !== undefined) out.price_baridimob = Number(out.price_baridimob);
  return out;
}
function normalizeRows(rows) {
  return (rows || []).map(normalizeRow);
}

// Make sure the table exists before handling any request.
router.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Database initialization failed' });
  }
});

// ---------------------------------------------------------------------
// Admin auth — stateless shared-password check against the bcrypt hash
// stored in the database (see admin_settings table above). The admin
// frontend asks for the password once, keeps it in localStorage, and
// sends it as a header on every admin request.
// ---------------------------------------------------------------------
async function requireAdmin(req, res, next) {
  try {
    const client = await getClient();
    const hash = await getAdminPasswordHash(client);
    if (!hash) {
      return res.status(412).json({
        error: 'لم يتم إعداد كلمة مرور بعد. افتح /api/admin/setup لتوليد واحدة.',
        code: 'ADMIN_NOT_CONFIGURED'
      });
    }
    const supplied = req.headers['x-admin-password'];
    if (!supplied || !(await bcrypt.compare(String(supplied), hash))) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auth check failed' });
  }
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const { gems, gold_bars, price_usd, price_flexy, price_baridimob, status } = body || {};

  if (!partial || gems !== undefined) {
    if (gems === undefined || isNaN(Number(gems)) || Number(gems) < 0) errors.push('gems must be a non-negative number');
  }
  if (!partial || gold_bars !== undefined) {
    if (gold_bars === undefined || isNaN(Number(gold_bars)) || Number(gold_bars) < 0) errors.push('gold_bars must be a non-negative number');
  }
  if (price_usd !== undefined && isNaN(Number(price_usd))) errors.push('price_usd must be a number');
  if (price_flexy !== undefined && isNaN(Number(price_flexy))) errors.push('price_flexy must be a number');
  if (price_baridimob !== undefined && isNaN(Number(price_baridimob))) errors.push('price_baridimob must be a number');
  if (status !== undefined && !VALID_STATUSES.includes(status)) errors.push('status must be one of available, sold');
  return errors;
}

// ---------------------------------------------------------------------
// PUBLIC: list available accounts (storefront)
// ---------------------------------------------------------------------
router.get('/accounts', async (req, res) => {
  try {
    const client = await getClient();
    const result = await client.execute(
      `SELECT * FROM accounts WHERE status = 'available' ORDER BY created_at DESC, id DESC`
    );
    res.json(normalizeRows(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: is a password configured yet? (public — lets the frontend decide
// whether to show the first-time setup screen or the normal login form)
// ---------------------------------------------------------------------
router.get('/admin/setup-status', async (req, res) => {
  try {
    const client = await getClient();
    const hash = await getAdminPasswordHash(client);
    res.json({ configured: !!hash });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check setup status' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: first-time setup — generates a random password, stores only its
// bcrypt hash, and returns the plaintext ONCE. Refuses if a password is
// already configured (use /admin/regenerate-password instead, which
// requires being logged in with the current password).
// ---------------------------------------------------------------------
router.post('/admin/setup', async (req, res) => {
  try {
    const client = await getClient();
    const existing = await getAdminPasswordHash(client);
    if (existing) {
      return res.status(409).json({
        error: 'تم إعداد كلمة مرور مسبقاً. سجل الدخول ثم استخدم "توليد كلمة مرور جديدة" إن أردت تغييرها.',
        code: 'ALREADY_CONFIGURED'
      });
    }
    const plaintext = await generateAndStoreAdminPassword(client);
    res.status(201).json({ password: plaintext });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate admin password' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: regenerate the password (must already be logged in with the
// current one). Returns the new plaintext password ONCE.
// ---------------------------------------------------------------------
router.post('/admin/regenerate-password', requireAdmin, async (req, res) => {
  try {
    const client = await getClient();
    const plaintext = await generateAndStoreAdminPassword(client);
    res.json({ password: plaintext });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to regenerate admin password' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: login check
// ---------------------------------------------------------------------
router.post('/admin/login', async (req, res) => {
  try {
    const client = await getClient();
    const hash = await getAdminPasswordHash(client);
    if (!hash) {
      return res.status(412).json({
        error: 'لم يتم إعداد كلمة مرور بعد. افتح /api/admin/setup لتوليد واحدة.',
        code: 'ADMIN_NOT_CONFIGURED'
      });
    }
    const { password } = req.body || {};
    if (password && (await bcrypt.compare(String(password), hash))) {
      return res.json({ ok: true });
    }
    res.status(401).json({ error: 'Invalid admin password' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login check failed' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: full list (all statuses)
// ---------------------------------------------------------------------
router.get('/admin/accounts', requireAdmin, async (req, res) => {
  try {
    const client = await getClient();
    const result = await client.execute('SELECT * FROM accounts ORDER BY created_at DESC, id DESC');
    res.json(normalizeRows(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: search by code (partial match, case-insensitive)
// ---------------------------------------------------------------------
router.get('/admin/accounts/search', requireAdmin, async (req, res) => {
  try {
    const query = String(req.query.code || '').trim().toUpperCase();
    const client = await getClient();
    const result = await client.execute({
      sql: `SELECT * FROM accounts WHERE UPPER(code) LIKE ? ORDER BY created_at DESC, id DESC`,
      args: [`%${query}%`]
    });
    res.json(normalizeRows(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: create account (code is always generated server-side)
// ---------------------------------------------------------------------
router.post('/admin/accounts', requireAdmin, async (req, res) => {
  const errors = validatePayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const { title, gems, gold_bars, image_url, price_usd, price_flexy, price_baridimob, note, status } = req.body;
  try {
    const client = await getClient();
    const code = await generateUniqueCode(client);
    const result = await client.execute({
      sql: `INSERT INTO accounts
              (code, title, gems, gold_bars, image_url, price_usd, price_flexy, price_baridimob, note, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        code,
        title ? String(title).trim() : null,
        Number(gems) || 0,
        Number(gold_bars) || 0,
        image_url ? String(image_url).trim() : null,
        Number(price_usd) || 0,
        Number(price_flexy) || 0,
        Number(price_baridimob) || 0,
        note ? String(note).trim() : null,
        VALID_STATUSES.includes(status) ? status : 'available'
      ]
    });
    res.status(201).json(normalizeRow(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: update account (code is never changed here — use regenerate-code)
// ---------------------------------------------------------------------
router.put('/admin/accounts/:id', requireAdmin, async (req, res) => {
  try {
    const client = await getClient();
    const body = req.body || {};

    const existingResult = await client.execute({ sql: 'SELECT * FROM accounts WHERE id = ?', args: [req.params.id] });
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    const errors = validatePayload(body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const merged = {
      title: body.title !== undefined ? (body.title ? String(body.title).trim() : null) : existing.title,
      gems: body.gems !== undefined ? Number(body.gems) : existing.gems,
      gold_bars: body.gold_bars !== undefined ? Number(body.gold_bars) : existing.gold_bars,
      image_url: body.image_url !== undefined ? (body.image_url ? String(body.image_url).trim() : null) : existing.image_url,
      price_usd: body.price_usd !== undefined ? Number(body.price_usd) : existing.price_usd,
      price_flexy: body.price_flexy !== undefined ? Number(body.price_flexy) : existing.price_flexy,
      price_baridimob: body.price_baridimob !== undefined ? Number(body.price_baridimob) : existing.price_baridimob,
      note: body.note !== undefined ? (body.note ? String(body.note).trim() : null) : existing.note,
      status: body.status !== undefined && VALID_STATUSES.includes(body.status) ? body.status : existing.status
    };

    const result = await client.execute({
      sql: `UPDATE accounts SET
              title=?, gems=?, gold_bars=?, image_url=?, price_usd=?, price_flexy=?, price_baridimob=?, note=?, status=?
            WHERE id=? RETURNING *`,
      args: [
        merged.title, merged.gems, merged.gold_bars, merged.image_url,
        merged.price_usd, merged.price_flexy, merged.price_baridimob,
        merged.note, merged.status, req.params.id
      ]
    });
    res.json(normalizeRow(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: regenerate an account's code
// ---------------------------------------------------------------------
router.post('/admin/accounts/:id/regenerate-code', requireAdmin, async (req, res) => {
  try {
    const client = await getClient();
    const code = await generateUniqueCode(client);
    const result = await client.execute({
      sql: 'UPDATE accounts SET code = ? WHERE id = ? RETURNING *',
      args: [code, req.params.id]
    });
    if (!result.rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json(normalizeRow(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to regenerate code' });
  }
});

// ---------------------------------------------------------------------
// ADMIN: delete account
// ---------------------------------------------------------------------
router.delete('/admin/accounts/:id', requireAdmin, async (req, res) => {
  try {
    const client = await getClient();
    const result = await client.execute({ sql: 'DELETE FROM accounts WHERE id = ? RETURNING id', args: [req.params.id] });
    if (!result.rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json({ success: true, id: Number(req.params.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

module.exports = router;
