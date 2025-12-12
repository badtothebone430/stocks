# Loki Clarke's Stocks & Signals

Simple static site that reads `signals.json` and displays stock signals.

Quick start:

1. Edit signals with the helper (optional):

```
python add_stock.py add --ticker AAPL --name "Apple" --buy_price 170.25 --buy_amount 10
python add_stock.py list
python add_stock.py edit --ticker AAPL --buy_price 171
python add_stock.py remove --ticker AAPL
```

2. Serve the folder (for example):

```
python -m http.server 8000

# then open http://localhost:8000
```

Notes:
- The `signals.json` file is the single source of truth for the UI.
- `add_stock.py` is a minimal helper for local editing; it's included in `.gitignore` by default.

Browser editor:
- Use the **Add Signal** button to open the in-browser form and create a new signal.
- Click any card to edit or delete an existing signal.
- Use **Export** to download the current signals as `signals.json`.
- Use **Import** to load a `signals.json` file (this will replace the current list in the page).

Admin protection (optional, recommended):
- Create a `local_config.js` file in the project root (this file is gitignored) and add a single line that sets the SHA-256 hex of a secret password, for example:

```js
// local_config.js (DO NOT commit)
window.ADMIN_HASH = 'your_sha256_hex_here'
```

- To compute the SHA-256 hex of a password locally, you can run (requires Python 3):

```powershell
python - <<'PY'
import hashlib; print(hashlib.sha256(b'my-secret-password').hexdigest())
PY
```

- After creating `local_config.js`, the site will prompt for the password before allowing Add/Import/Export/Delete actions. The unlocked session lasts for the browser session only.

Price API (optional — for accurate charts):
- If you want real historical prices in the public chart, you can configure an API key for Alpha Vantage. Create or edit `local_config.js` (gitignored) and add:

```js
// local_config.js (DO NOT commit)
window.PRICE_API = { provider: 'alpha_vantage', key: 'YOUR_ALPHA_VANTAGE_KEY' }
```

- Get a free API key at https://www.alphavantage.co/support/#api-key. Note Alpha Vantage rate limits (5 requests/minute, 500/day for the free tier).
- The viewer will attempt to fetch the last 14 daily closes for each ticker when you open its chart; if the API is not configured or the request fails, the page will fall back to a synthetic series.


To persist changes to the repo, either replace the repository `signals.json` with the exported file, or continue using `add_stock.py` as your canonical editing workflow.

Admin workflow (recommended for private edits):
- Use the admin copy `index_admin.html` to edit/add/remove signals locally — it contains the in-browser editor and export/import tools.
- `index_admin.html` is gitignored by default so you can keep your editable copy private.
- When you want to publish updates, export `signals.json` from the admin page and replace the repo `signals.json`, or copy the updated `signals.json` into the repo and push.
