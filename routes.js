/**
 * Shared CRUD routes for /items, mounted:
 *   - at /api          in server.js (local dev / Render / any Node host)
 *   - at /.netlify/functions/api   in netlify/functions/api.js
 *
 * The frontend always calls "/api/items" — Netlify's redirect rule in
 * netlify.toml rewrites that to the function path transparently.
 */

const express = require('express');
const { getClient, initDb } = require('./db');

const router = express.Router();

const VALID_GRID_SIZES = [1, 2, 4, 6];
const VALID_RARITIES = ['gold', 'purple', 'blue'];

// Make sure the table exists before handling any request
// Some SQLite/libSQL driver configurations can return integer columns as
// BigInt or string instead of a plain Number. The frontend compares ids with
// Number(...), so normalizing here guarantees ids always round-trip as
// ordinary numbers — this is what edit/delete depend on to find the right row.
function normalizeRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.id !== undefined) out.id = Number(out.id);
  return out;
}
function normalizeRows(rows) {
  return (rows || []).map(normalizeRow);
}

router.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Database initialization failed' });
  }
});

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const { name, grid_size, rarity, price } = body || {};

  if (!partial || name !== undefined) {
    if (!name || typeof name !== 'string' || !name.trim()) errors.push('name is required');
  }
  if (!partial || grid_size !== undefined) {
    if (!VALID_GRID_SIZES.includes(Number(grid_size))) errors.push('grid_size must be one of 1, 2, 4, 6');
  }
  if (!partial || rarity !== undefined) {
    if (!VALID_RARITIES.includes(rarity)) errors.push('rarity must be one of gold, purple, blue');
  }
  if (price !== undefined && isNaN(Number(price))) errors.push('price must be a number');
  return errors;
}

// GET all items
router.get('/items', async (req, res) => {
  try {
    const client = await getClient();
    const result = await client.execute('SELECT * FROM items ORDER BY created_at DESC, id DESC');
    res.json(normalizeRows(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET single item
router.get('/items/:id', async (req, res) => {
  try {
    const client = await getClient();
    const result = await client.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [req.params.id] });
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(normalizeRow(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// CREATE item
router.post('/items', async (req, res) => {
  const errors = validatePayload(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });

  const { name, name_ar, image_url, price, grid_size, rarity } = req.body;
  try {
    const client = await getClient();
    // Single round-trip: INSERT ... RETURNING gives us the created row directly,
    // instead of a separate INSERT + SELECT (this used to be 2 network calls
    // to the remote Turso database; on a serverless function each round-trip
    // adds real latency, which is what made Add/Edit/Delete feel slow).
    const result = await client.execute({
      sql: `INSERT INTO items (name, name_ar, image_url, price, grid_size, rarity) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      args: [
        name.trim(),
        name_ar ? String(name_ar).trim() : null,
        image_url ? String(image_url).trim() : null,
        Number(price) || 0,
        Number(grid_size),
        rarity
      ]
    });
    res.status(201).json(normalizeRow(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// UPDATE item
router.put('/items/:id', async (req, res) => {
  try {
    const client = await getClient();
    const body = req.body || {};
    const fieldKeys = ['name', 'name_ar', 'image_url', 'price', 'grid_size', 'rarity'];
    const isFullUpdate = fieldKeys.every((k) => k in body);

    // Fast path (this is what the app's own edit form always sends): every
    // field is present, so we can UPDATE ... RETURNING * in a single
    // round-trip instead of SELECT-then-UPDATE-then-SELECT (3 round-trips).
    if (isFullUpdate) {
      const errors = validatePayload(body);
      if (errors.length) return res.status(400).json({ error: errors.join(', ') });
      const { name, name_ar, image_url, price, grid_size, rarity } = body;
      const result = await client.execute({
        sql: `UPDATE items SET name=?, name_ar=?, image_url=?, price=?, grid_size=?, rarity=? WHERE id=? RETURNING *`,
        args: [
          name.trim(),
          name_ar ? String(name_ar).trim() : null,
          image_url ? String(image_url).trim() : null,
          Number(price) || 0,
          Number(grid_size),
          rarity,
          req.params.id
        ]
      });
      if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
      return res.json(normalizeRow(result.rows[0]));
    }

    // Slow path: a genuine partial update (only some fields sent) still
    // needs to read the existing row first so we know what to keep.
    const existingResult = await client.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [req.params.id] });
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const errors = validatePayload(body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const merged = {
      name: body.name !== undefined ? String(body.name).trim() : existing.name,
      name_ar: body.name_ar !== undefined ? (body.name_ar ? String(body.name_ar).trim() : null) : existing.name_ar,
      image_url: body.image_url !== undefined ? (body.image_url ? String(body.image_url).trim() : null) : existing.image_url,
      price: body.price !== undefined ? Number(body.price) : existing.price,
      grid_size: body.grid_size !== undefined ? Number(body.grid_size) : existing.grid_size,
      rarity: body.rarity !== undefined ? body.rarity : existing.rarity
    };

    const updateResult = await client.execute({
      sql: `UPDATE items SET name=?, name_ar=?, image_url=?, price=?, grid_size=?, rarity=? WHERE id=? RETURNING *`,
      args: [merged.name, merged.name_ar, merged.image_url, merged.price, merged.grid_size, merged.rarity, req.params.id]
    });
    res.json(normalizeRow(updateResult.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE item
router.delete('/items/:id', async (req, res) => {
  try {
    const client = await getClient();
    // Single round-trip DELETE ... RETURNING, instead of SELECT-to-check + DELETE.
    const result = await client.execute({ sql: 'DELETE FROM items WHERE id = ? RETURNING id', args: [req.params.id] });
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true, id: Number(req.params.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

module.exports = router;
