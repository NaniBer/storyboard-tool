import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { hashPassword, verifyPassword, type AuthConfig } from './auth.js';
import { openSceneStore, type SceneStore } from './scenes.js';

const dataDir = mkdtempSync(join(tmpdir(), 'storyboard-auth-'));
const origin = 'http://127.0.0.1:5173';
let store: SceneStore;
let server: Server;
let baseUrl: string;
let config: AuthConfig;

async function start() {
  server = createApp(store, { auth: config }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stop() {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

before(async () => {
  config = {
    username: 'owner',
    passwordHash: await hashPassword('a long test password'),
    allowedOrigin: origin,
    secureCookie: false,
    sameSite: 'lax',
  };
  store = openSceneStore(dataDir);
  store.create('Existing scene', 'Keep this after login');
  await start();
});

after(async () => {
  await stop();
  store.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('passwords are salted and verified without storing the plaintext', async () => {
  const first = await hashPassword('a long test password');
  const second = await hashPassword('a long test password');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('a long test password', first), true);
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword('a long test password', 'invalid'), false);
});

test('blocks storyboard, preview, export, and AI routes before login', async () => {
  for (const path of ['/api/scenes', '/api/scenes/anything/export/pdf', '/api/images/anything/preview']) {
    assert.equal((await fetch(`${baseUrl}${path}`)).status, 401, path);
  }
  assert.equal((await fetch(`${baseUrl}/api/shots/anything/generate-prompt`, { method: 'POST' })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
});

test('rejects wrong credentials and unrecognized browser origins', async () => {
  const wrongOrigin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { origin: 'https://wrong.example', 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'a long test password' }),
  });
  assert.equal(wrongOrigin.status, 403);
  const wrongPassword = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'wrong password' }),
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.headers.get('set-cookie'), null);
});

test('keeps a session across restart, requires CSRF for changes, and revokes it on logout', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'a long test password' }),
  });
  assert.equal(login.status, 200);
  const identity = await login.json() as { username: string; csrfToken: string };
  assert.equal(identity.username, 'owner');
  assert.ok(identity.csrfToken.length > 20);
  const setCookie = login.headers.get('set-cookie') ?? '';
  assert.match(setCookie, /storyboard_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  const cookie = setCookie.split(';', 1)[0];

  const scenes = await fetch(`${baseUrl}/api/scenes`, { headers: { cookie } });
  assert.equal(scenes.status, 200);
  assert.deepEqual((await scenes.json() as Array<{ title: string }>).map((scene) => scene.title), ['Existing scene']);

  const noCsrf = await fetch(`${baseUrl}/api/scenes`, {
    method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Blocked scene' }),
  });
  assert.equal(noCsrf.status, 403);
  const wrongMutationOrigin = await fetch(`${baseUrl}/api/scenes`, {
    method: 'POST', headers: { origin: 'https://wrong.example', cookie, 'x-csrf-token': identity.csrfToken, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Blocked scene' }),
  });
  assert.equal(wrongMutationOrigin.status, 403);
  const created = await fetch(`${baseUrl}/api/scenes`, {
    method: 'POST', headers: { origin, cookie, 'x-csrf-token': identity.csrfToken, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Saved scene' }),
  });
  assert.equal(created.status, 201);

  await stop();
  store.close();
  store = openSceneStore(dataDir);
  await start();
  const reopened = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
  assert.equal(reopened.status, 200);
  assert.equal((await reopened.json()).csrfToken, identity.csrfToken);
  assert.equal((await fetch(`${baseUrl}/api/scenes`, { headers: { cookie } })).status, 200);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { origin, cookie, 'x-csrf-token': identity.csrfToken },
  });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(`${baseUrl}/api/scenes`, { headers: { cookie } })).status, 401);
});
