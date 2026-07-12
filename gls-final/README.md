# GLS Dashboard

A Moodle dashboard for GLS University (btech.glsmoodle.in).

## Deploy on Render

### Option A — Using render.yaml (recommended)
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your GitHub repo — Render will auto-detect `render.yaml`

### Option B — Manual setup
1. Push this repo to GitHub
2. Go to Render → New → Web Service → Connect repo
3. Set:
   - **Build Command:** `npm install && npm run build && cd server && npm install`
   - **Start Command:** `node server/server.js`
   - **Environment:** Node

## Local Development

```bash
# Terminal 1 — backend proxy
cd server && npm install && node server.js

# Terminal 2 — frontend
npm install && npm run dev
```

## How it works

- The Express server (`server/server.js`) proxies all Moodle API calls to avoid CORS issues
- In production, the same Express server also serves the built React app from `dist/`
- In development, Vite's dev server proxies `/proxy/*` to Express on port 3000
