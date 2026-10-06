# Storyboard Tool

React frontend and Node API in one npm workspace. Scenes and their shots can be created, edited, reordered, and reopened. Each shot can have an uploaded image with a generated preview. Scenes can be downloaded as a PDF storyboard, prompts text, or portable JSON.

## Run locally

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Create a scene with a title and optional description, then select it from the sidebar to edit it. Add shots below the scene details; each shot has a visual shot-type picker, description, notes, draft/approved status, and up/down ordering controls. Use **View shots** to see the ordered sequence side by side without edit fields, and **Edit shots** to return to the editor. Upload a JPEG, PNG, or WebP image (up to 20 MB) to a shot. The app shows processing and failure states, and lets you retry or replace a failed upload. A new upload keeps the previous successful preview available until its replacement is ready. Use **Generate prompt** on a shot to create a visual prompt from its details and available image. Generated prompts are saved with the shot; regenerating an approved shot returns it to draft. Use the export controls to download a PDF with shot images, descriptions, notes, and approved prompts; a text file with all generated prompts; or a JSON file with ordered shot data and embedded preview images. Exports use saved data. The scene URL contains its ID, so refreshing the page reopens it and its shots.

## OpenRouter setup

Create an API key at [OpenRouter Keys](https://openrouter.ai/settings/keys). Copy `.env.example` to `.env` in this project's root and replace the placeholder with your key:

```sh
cp .env.example .env
```

The backend reads `.env` at startup. Restart `npm run dev` after adding or changing the key. The default model is `openrouter/free`, which accepts text and image input. Set `OPENROUTER_MODEL` in `.env` to another vision-capable OpenRouter model if desired. The key stays on the backend and is ignored by Git; do not put it in a `VITE_` variable.

Vite forwards `/api` requests to the API on port 3001. Check `http://127.0.0.1:3001/api/health` to confirm the API is running. Run `npm test -w @storyboard/api` for the API tests.

The API stores scene, shot, and image state in `data/storyboard.sqlite`, originals in `data/originals`, and generated previews in `data/previews` by default. Set `DATA_DIR` to use another directory. Interrupted image jobs resume when the API starts again. When Docker packaging is added, mount the entire data directory outside the container so the database and images survive deployments. For a separately hosted frontend, set `VITE_API_BASE_URL` to the API's `/api` URL at build time; cross-origin access will need to be configured before deployment.
