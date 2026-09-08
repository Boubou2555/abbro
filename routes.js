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
    res.json(result.rows);
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
    res.json(result.rows[0]);
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
    const insert = await client.execute({
      sql: `INSERT INTO items (name, name_ar, image_url, price, grid_size, rarity) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        name.trim(),
        name_ar ? String(name_ar).trim() : null,
        image_url ? String(image_url).trim() : null,
        Number(price) || 0,
        Number(grid_size),
        rarity
      ]
    });
    const newId = Number(insert.lastInsertRowid);
    const created = await client.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [newId] });
    res.status(201).json(created.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// UPDATE item
router.put('/items/:id', async (req, res) => {
  try {
    const client = await getClient();
    const existingResult = await client.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [req.params.id] });
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const errors = validatePayload(req.body, { partial: true });
    if (errors.length) return res.status(400).json({ error: errors.join(', ') });

    const { name, name_ar, image_url, price, grid_size, rarity } = req.body;
    const merged = {
      name: name !== undefined ? String(name).trim() : existing.name,
      name_ar: name_ar !== undefined ? (name_ar ? String(name_ar).trim() : null) : existing.name_ar,
      image_url: image_url !== undefined ? (image_url ? String(image_url).trim() : null) : existing.image_url,
      price: price !== undefined ? Number(price) : existing.price,
      grid_size: grid_size !== undefined ? Number(grid_size) : existing.grid_size,
      rarity: rarity !== undefined ? rarity : existing.rarity
    };

    await client.execute({
      sql: `UPDATE items SET name=?, name_ar=?, image_url=?, price=?, grid_size=?, rarity=? WHERE id=?`,
      args: [merged.name, merged.name_ar, merged.image_url, merged.price, merged.grid_size, merged.rarity, req.params.id]
    });

    const updatedResult = await client.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [req.params.id] });
    res.json(updatedResult.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE item
router.delete('/items/:id', async (req, res) => {
  try {
    const client = await getClient();
    const existingResult = await client.execute({ sql: 'SELECT * FROM items WHERE id = ?', args: [req.params.id] });
    if (!existingResult.rows.length) return res.status(404).json({ error: 'Item not found' });

    await client.execute({ sql: 'DELETE FROM items WHERE id = ?', args: [req.params.id] });
    res.json({ success: true, id: Number(req.params.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

module.exports = router;
