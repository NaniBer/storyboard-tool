import { createApp } from './app.js';
import { openSceneStore } from './scenes.js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { authConfigFromEnv } from './auth.js';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envPath)) {
  const values = parseEnv(readFileSync(envPath, 'utf8'));
  for (const name of ['OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'AUTH_USERNAME', 'AUTH_PASSWORD_HASH', 'AUTH_ALLOWED_ORIGIN', 'AUTH_COOKIE_SAME_SITE', 'AUTH_DEMO_LOGIN', 'AUTH_DEMO_PASSWORD'] as const) {
    if (values[name] !== undefined) process.env[name] = values[name];
  }
}

const app = createApp(openSceneStore(), { auth: authConfigFromEnv() });
const port = Number(process.env.PORT ?? 3001);

app.listen(port, () => {
  console.log(`Storyboard API listening on http://localhost:${port}`);
});
