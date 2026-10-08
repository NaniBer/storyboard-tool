# Storyboard Tool

React frontend and Node API in one npm workspace. Scenes and their shots can be created, edited, reordered, and reopened. Each shot can have an uploaded image with a generated preview. Scenes can be downloaded as a PDF storyboard, prompts text, or portable JSON.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
test -f .env || cp .env.example .env
npm run auth:password -w @storyboard/api
npm run dev
```

Put the generated `AUTH_PASSWORD_HASH` in `.env`. The password command asks for a password twice without displaying it; only the hash is saved. Existing scenes stay in the same database and appear after signing in. Restart the API after changing `.env`.

Open http://127.0.0.1:5173 and sign in with `ehudaiuser` (or your `AUTH_USERNAME`) and the password you chose. Create a scene with a title and optional description, then select it from the sidebar to edit it. Add shots below the scene details; each shot has a visual shot-type picker, description, notes, draft/approved status, and up/down ordering controls. Use **View shots** to see the ordered sequence side by side without edit fields, and **Edit shots** to return to the editor. Upload a JPEG, PNG, or WebP image (up to 20 MB) to a shot. The app shows processing and failure states, and lets you retry or replace a failed upload. A new upload keeps the previous successful preview available until its replacement is ready. Use **Generate prompt** on a shot to create a visual prompt from its details and available image. Generated prompts are saved with the shot; regenerating an approved shot returns it to draft. Use the export controls to download a PDF with shot images, descriptions, notes, and approved prompts; a text file with all generated prompts; or a JSON file with ordered shot data and embedded preview images. Exports use saved data. The scene URL contains its ID, so refreshing the page reopens it and its shots.

## OpenRouter setup

Create an API key at [OpenRouter Keys](https://openrouter.ai/settings/keys). Copy `.env.example` to `.env` in this project's root and replace the placeholder with your key:

```sh
test -f .env || cp .env.example .env
```

The backend reads `.env` at startup. Restart `npm run dev` after adding or changing the key. The default model is `openrouter/free`, which accepts text and image input. Set `OPENROUTER_MODEL` in `.env` to another vision-capable OpenRouter model if desired. The key stays on the backend and is ignored by Git; do not put it in a `VITE_` variable.

Vite forwards `/api` requests to the API on port 3001. Check `http://127.0.0.1:3001/api/health` to confirm the API is running. Run `npm test -w @storyboard/api` for the API tests.
If port 3001 is already used on your computer, run `PORT=3002 API_DEV_TARGET=http://127.0.0.1:3002 npm run dev` and check port 3002 instead.

The API stores scene, shot, and image state in `data/storyboard.sqlite`, originals in `data/originals`, and generated previews in `data/previews` by default. Set `DATA_DIR` to use another directory. Interrupted image jobs resume when the API starts again.

## Run the API with Docker

Docker Compose builds only the API and stores its SQLite database, image originals, and previews in the named `storyboard_data` volume. From the repository root:

```sh
test -f .env || cp .env.example .env
# Set OPENROUTER_API_KEY in .env if you want prompt generation.
# Set AUTH_PASSWORD_HASH in .env before starting the API. You can generate it
# on a machine with Node using `npm run auth:password -w @storyboard/api`.
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3001/api/health
```

The API is bound to the host's `127.0.0.1:3001`; it is not publicly reachable. If that port is already used, set `API_HOST_PORT` when starting Compose, for example `API_HOST_PORT=3301 docker compose up -d --build`. `docker compose down` removes the container but keeps the volume. **Do not use `docker compose down -v` unless you intend to delete all saved scenes and images.** Keep a backup of the volume outside the VPS before replacing or moving the server. The real `.env`, local `data/`, and Git files are excluded from the Docker build context.

The Docker volume starts empty. Existing scenes and images in a local `data/` directory are not copied into it automatically; migrate that whole directory separately if you want them on the server.

For a separately hosted frontend, set `VITE_API_BASE_URL` to the public HTTPS API's `/api` URL at build time and set `AUTH_ALLOWED_ORIGIN` to the frontend's exact HTTPS origin. If the two hosts are on different sites, set `AUTH_COOKIE_SAME_SITE=none`; browsers may still block third-party cookies, so using frontend and API subdomains on the same site is more reliable. The current Compose configuration binds the API to localhost, so a public HTTPS reverse proxy is required before the Vercel frontend can reach it. This login is a single shared owner account; it does not yet separate multiple users' data.
