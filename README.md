# Storyboard Tool

React frontend and Node API in one npm workspace. Scene editing, uploads, processing, and exports will be added in small end-to-end steps.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite forwards `/api` requests to the API on port 3001. Check `http://127.0.0.1:3001/api/health` to confirm the API is running.

The API will use `data/` for its SQLite database and image files. Keep that folder mounted outside the container when Docker packaging is added.
