# 🎯 Arena Breakout Loot Tracker

A full-stack, bilingual (English/Arabic RTL) app for tracking Arena Breakout
loot. Built to run on **Netlify** (frontend + serverless API) with a
**shared Turso database** (SQLite-compatible, hosted in the cloud) — so you
and a colleague hit the exact same URL and see each other's additions,
edits, and deletions in real time (on refresh).

## Stack
- **Frontend:** HTML5, CSS3, vanilla JS, Bootstrap 5 (+ RTL build) — served as static files
- **Backend:** Express routes running as a **Netlify Function** (serverless)
- **Database:** **Turso** (hosted libSQL — SQLite-compatible, works from serverless functions, unlike a local `.db` file)

## Project structure
```
arena-breakout-tracker/
├── server.js                 # local dev entry point (plain Node/Express)
├── routes.js                  # shared CRUD routes — used by server.js AND the Netlify function
├── db.js                       # shared Turso client + schema setup
├── netlify.toml                 # Netlify build + API redirect config
├── netlify/functions/api.js      # serverless wrapper around routes.js
├── package.json
├── .env.example                  # copy to .env for local dev
└── public/
    ├── index.html
    ├── app.js                     # calls /api/items — works locally AND on Netlify
    ├── styles.css
    └── items-data.json            # autocomplete library (not user data)
```

**Why not a local SQLite file?** Netlify Functions have no persistent disk —
every function call can start from a clean, empty filesystem. A `.db` file
written in one request would vanish before the next. Turso gives you the
same SQL/SQLite experience but as a real hosted database, so it works from
serverless functions and keeps data shared between everyone who uses the app.

---

## Step 1 — Set up the shared database (Turso)

1. Go to **[turso.tech](https://turso.tech)** and sign up (free tier is enough for this).
2. From the dashboard, create a new database (any name, e.g. `arena-loot`).
3. Open the database and copy two values:
   - **Database URL** (starts with `libsql://...`) → this is `TURSO_DATABASE_URL`
   - Generate/copy an **Auth Token** → this is `TURSO_AUTH_TOKEN`
4. Keep this browser tab open — you'll paste these two values into both your
   local `.env` file and into Netlify's environment variables.

*(If you prefer the CLI instead of the dashboard: `curl -sSfL https://get.tur.so/install.sh | bash`, then `turso auth login`, `turso db create arena-loot`, `turso db show arena-loot --url`, `turso db tokens create arena-loot`.)*

## Step 2 — Run it locally (optional, to test before deploying)

```bash
cp .env.example .env
# paste your TURSO_DATABASE_URL and TURSO_AUTH_TOKEN into .env

npm install
npm start
# open http://localhost:3000
```

## Step 3 — Push the project to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/arena-breakout-tracker.git
git push -u origin main
```
Replace `USERNAME` with your GitHub username and create the empty repo on
github.com first (New Repository → don't add a README, this project already
has one). `.env` is already in `.gitignore`, so your Turso token never gets
committed.

**To let your colleague edit the code too:** on the repo page →
**Settings → Collaborators → Add people** → enter their GitHub username.

## Step 4 — Deploy to Netlify

1. Go to **[app.netlify.com](https://app.netlify.com)** and sign up/log in (you can use your GitHub account).
2. Click **Add new site → Import an existing project → Deploy with GitHub**.
3. Pick the `arena-breakout-tracker` repository.
4. Build settings (Netlify usually reads these from `netlify.toml` automatically):
   - **Build command:** *(leave empty — there's nothing to compile)*
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
5. Before the first deploy (or right after, then redeploy), go to
   **Site configuration → Environment variables** and add:
   - `TURSO_DATABASE_URL` = the value from Step 1
   - `TURSO_AUTH_TOKEN` = the value from Step 1
6. Click **Deploy site**. Netlify gives you a live URL like
   `https://arena-breakout-tracker.netlify.app` (you can rename it in
   **Site configuration → Domain management** if you want something nicer).

## Step 5 — Share it with your colleague

Just send them the Netlify URL. That's it — there's nothing to install on
their end. Both of you are hitting:
- the same static frontend,
- the same serverless API (`/api/items` → the Netlify Function),
- the same Turso database.

So when either of you adds, edits, or deletes an item, the other person sees
it the next time they load or refresh the page. If you want it to update
*without* a manual refresh too, that would mean adding polling or
WebSockets/Server-Sent Events — not included here, but a reasonable next
step if you want live sync.

---

## REST API (unchanged regardless of host)
| Method | Endpoint       | Description       |
|--------|----------------|--------------------|
| GET    | /api/items      | List all items      |
| GET    | /api/items/:id  | Get a single item    |
| POST   | /api/items      | Create an item        |
| PUT    | /api/items/:id  | Update an item         |
| DELETE | /api/items/:id  | Delete an item          |
| GET    | /api/health      | Health check             |

## Customizing the item library
`public/items-data.json` only powers the autocomplete dropdown in "Add
Item" — it's static and separate from the real saved items (which live in
Turso). Swap the placeholder `image_url` values for real hosted icons
whenever you have them; no code changes needed.

## Notes / troubleshooting
- If the deployed site's "Add Item" button doesn't save anything, double
  check the two environment variables are set in Netlify (Step 4.5) and
  redeploy — env var changes require a new deploy to take effect.
- Rarity colors: Gold `#ffb400`, Purple `#a335ee`, Blue `#0070dd`.
- Grid sizes are restricted to 1, 2, 4, 6 in both the UI and the API.
- Still want a traditional server instead of Netlify (e.g. Render, a VPS)?
  `server.js` already works as a normal Express app against the same Turso
  database — just set the same two env vars there and run `npm start`.
