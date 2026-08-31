# GLS Dashboard — Moodle 1.1
 
 A modern, high-performance Moodle dashboard for GLS University students and faculty across B.Tech (FoT), BCA / BCA-IT (FCAIT UG), and MCA / M.Sc(IT) (FCAIT PG).

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
