import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import sharp from 'sharp';
import Database from 'better-sqlite3';
import { createApp } from './app.js';
import { openSceneStore, type SceneStore } from './scenes.js';
import { PromptGenerationError } from './prompt-generator.js';

const dataDir = mkdtempSync(join(tmpdir(), 'storyboard-scenes-'));
let store: SceneStore;
let server: Server;
let baseUrl: string;

before(async () => {
  store = openSceneStore(dataDir);
  server = createApp(store, { auth: null }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  store.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('creates, edits, and lists a scene through the API', async () => {
  const created = await fetch(`${baseUrl}/api/scenes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '  The letter outside the café  ', description: 'Opening scene' }),
  });
  assert.equal(created.status, 201);
  const scene = await created.json();
  assert.equal(scene.title, 'The letter outside the café');
  assert.equal(scene.description, 'Opening scene');
  assert.match(scene.id, /^[0-9a-f-]{36}$/);
  assert.ok(!Number.isNaN(Date.parse(scene.createdAt)));

  const edited = await fetch(`${baseUrl}/api/scenes/${scene.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'Rain at the café' }),
  });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).description, 'Rain at the café');

  const listed = await fetch(`${baseUrl}/api/scenes`);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).length, 1);

});

test('rejects invalid scenes and reports missing scenes', async () => {
  const invalidCreate = await fetch(`${baseUrl}/api/scenes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '   ' }),
  });
  assert.equal(invalidCreate.status, 400);
  assert.equal((await invalidCreate.json()).error, 'Title is required');

  const invalidPatch = await fetch(`${baseUrl}/api/scenes/missing`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'x'.repeat(2001) }),
  });
  assert.equal(invalidPatch.status, 400);
  assert.match((await invalidPatch.json()).error, /2000/);

  const missing = await fetch(`${baseUrl}/api/scenes/missing`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'Scene not found' });
});

test('keeps a scene after the database closes and reopens', () => {
  const reopenDir = mkdtempSync(join(tmpdir(), 'storyboard-reopen-'));
  try {
    let connection = openSceneStore(reopenDir);
    const scene = connection.create('Saved scene', 'Persist this');
    connection.close();

    connection = openSceneStore(reopenDir);
    assert.deepEqual(connection.get(scene.id), scene);
    connection.close();
  } finally {
    rmSync(reopenDir, { recursive: true, force: true });
  }
});

test('orders scenes through the API and keeps that order after reopening', async () => {
  const first = store.create('First in story', '');
  const second = store.create('Second in story', '');
  const current = store.list();
  const requested = [second.id, first.id, ...current.filter((scene) => scene.id !== first.id && scene.id !== second.id).map((scene) => scene.id)];
  const response = await fetch(`${baseUrl}/api/scenes/order`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: requested }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map((scene: { id: string }) => scene.id), requested);
  assert.deepEqual(store.list().map((scene) => scene.position), requested.map((_, index) => index));

  for (const ids of [[first.id], [first.id, first.id], [...requested, 'unknown']]) {
    const invalid = await fetch(`${baseUrl}/api/scenes/order`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(store.list().map((scene) => scene.id), requested);
  }
  const reopened = openSceneStore(dataDir);
  assert.deepEqual(reopened.list().map((scene) => scene.id), requested);
  reopened.close();
});

test('upgrades an existing scene database without losing scene data or visible order', () => {
  const legacyDir = mkdtempSync(join(tmpdir(), 'storyboard-legacy-scenes-'));
  try {
    const database = new Database(join(legacyDir, 'storyboard.sqlite'));
    database.exec("CREATE TABLE scenes (id TEXT PRIMARY KEY, owner_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    const insert = database.prepare('INSERT INTO scenes (id, owner_id, title, description, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?)');
    insert.run('older', 'Older scene', 'Keep its description', '2026-01-01', '2026-01-01');
    insert.run('newer', 'Newer scene', '', '2026-01-02', '2026-01-02');
    database.close();

    const upgraded = openSceneStore(legacyDir);
    assert.deepEqual(upgraded.list().map((scene) => [scene.id, scene.position]), [['newer', 0], ['older', 1]]);
    assert.equal(upgraded.get('older')?.description, 'Keep its description');
    assert.equal(upgraded.create('Next scene', '').position, 2);
    upgraded.close();
  } finally {
    rmSync(legacyDir, { recursive: true, force: true });
  }
});

test('creates, edits, reorders, and deletes shots through the API', async () => {
  const sceneResponse = await fetch(`${baseUrl}/api/scenes`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Shot lifecycle' }),
  });
  const scene = await sceneResponse.json();
  const create = async (description: string) => {
    const response = await fetch(`${baseUrl}/api/scenes/${scene.id}/shots`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shotType: 'Wide shot', description }),
    });
    assert.equal(response.status, 201);
    return response.json();
  };
  const first = await create('Outside the café');
  const second = await create('Letter on the table');
  assert.equal(first.position, 0);
  assert.equal(second.position, 1);
  assert.equal(first.status, 'draft');
  assert.equal(first.notes, '');
  assert.equal(first.sceneId, scene.id);
  assert.equal((await (await fetch(`${baseUrl}/api/scenes/${scene.id}`)).json()).shotCount, 2);

  const editedResponse = await fetch(`${baseUrl}/api/shots/${first.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ notes: 'Rain', prompt: 'Moody street', status: 'approved' }),
  });
  assert.equal(editedResponse.status, 200);
  const edited = await editedResponse.json();
  assert.equal(edited.notes, 'Rain');
  assert.equal(edited.prompt, 'Moody street');
  assert.equal(edited.status, 'approved');

  const orderResponse = await fetch(`${baseUrl}/api/scenes/${scene.id}/shots/order`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [second.id, first.id] }),
  });
  assert.equal(orderResponse.status, 200);
  assert.deepEqual((await orderResponse.json()).map((shot: { id: string }) => shot.id), [second.id, first.id]);

  const deleted = await fetch(`${baseUrl}/api/shots/${second.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  const remaining = await fetch(`${baseUrl}/api/scenes/${scene.id}/shots`);
  assert.deepEqual((await remaining.json()).map((shot: { id: string; position: number }) => [shot.id, shot.position]), [[first.id, 0]]);
  assert.equal((await fetch(`${baseUrl}/api/shots/${second.id}`, { method: 'DELETE' })).status, 404);
});

test('rejects invalid shot fields and orders without changing either scene', async () => {
  const createScene = async (title: string) => {
    const response = await fetch(`${baseUrl}/api/scenes`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }),
    });
    return response.json();
  };
  const sceneA = await createScene('Scene A');
  const sceneB = await createScene('Scene B');
  const createShot = async (sceneId: string) => {
    const response = await fetch(`${baseUrl}/api/scenes/${sceneId}/shots`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    return response.json();
  };
  const shotA = await createShot(sceneA.id);
  const shotB = await createShot(sceneB.id);

  const invalidStatus = await fetch(`${baseUrl}/api/shots/${shotA.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'done' }),
  });
  assert.equal(invalidStatus.status, 400);
  const tooLong = await fetch(`${baseUrl}/api/scenes/${sceneA.id}/shots`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shotType: 'x'.repeat(81) }),
  });
  assert.equal(tooLong.status, 400);
  const crossScene = await fetch(`${baseUrl}/api/scenes/${sceneA.id}/shots/order`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [shotB.id] }),
  });
  assert.equal(crossScene.status, 400);
  const duplicates = await fetch(`${baseUrl}/api/scenes/${sceneA.id}/shots/order`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [shotA.id, shotA.id] }),
  });
  assert.equal(duplicates.status, 400);
  const sceneAShots = await (await fetch(`${baseUrl}/api/scenes/${sceneA.id}/shots`)).json();
  const sceneBShots = await (await fetch(`${baseUrl}/api/scenes/${sceneB.id}/shots`)).json();
  assert.deepEqual(sceneAShots.map((shot: { id: string; position: number }) => [shot.id, shot.position]), [[shotA.id, 0]]);
  assert.deepEqual(sceneBShots.map((shot: { id: string; position: number }) => [shot.id, shot.position]), [[shotB.id, 0]]);
  assert.equal((await fetch(`${baseUrl}/api/scenes/missing/shots`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/scenes/missing/shots/order`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [] }),
  })).status, 404);
});

test('keeps shots and their order after reopening the database', () => {
  const reopenDir = mkdtempSync(join(tmpdir(), 'storyboard-shots-reopen-'));
  try {
    let connection = openSceneStore(reopenDir);
    const scene = connection.create('Saved shots', '');
    const first = connection.createShot(scene.id, { shotType: 'Wide', description: 'One', notes: '', prompt: '' });
    const second = connection.createShot(scene.id, { shotType: 'Close-up', description: 'Two', notes: '', prompt: '' });
    connection.updateShot(first.id, { status: 'approved', notes: 'Keep this' });
    connection.orderShots(scene.id, [second.id, first.id]);
    connection.close();

    connection = openSceneStore(reopenDir);
    const shots = connection.listShots(scene.id);
    assert.deepEqual(shots.map((shot) => shot.id), [second.id, first.id]);
    assert.equal(shots[1].status, 'approved');
    assert.equal(shots[1].notes, 'Keep this');
    connection.close();
  } finally {
    rmSync(reopenDir, { recursive: true, force: true });
  }
});

test('processes images independently and recovers a failed upload by replacement', async () => {
  const scene = await (await fetch(`${baseUrl}/api/scenes`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Image recovery' }),
  })).json();
  const makeShot = async () => (await fetch(`${baseUrl}/api/scenes/${scene.id}/shots`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  })).json();
  const goodShot = await makeShot();
  const badShot = await makeShot();
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#b46346' } }).png().toBuffer();

  const upload = async (shotId: string, bytes: Uint8Array, filename: string, mimeType: string) => {
    const form = new FormData();
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);
    return fetch(`${baseUrl}/api/shots/${shotId}/image`, { method: 'POST', body: form });
  };
  const imageFor = async (shotId: string) => {
    const shots = await (await fetch(`${baseUrl}/api/scenes/${scene.id}/shots`)).json() as Array<{ id: string; image: { status: string; error: string | null; previewUrl: string | null; previousPreviewUrl: string | null } | null }>;
    return shots.find((shot) => shot.id === shotId)?.image;
  };
  const waitFor = async (shotId: string, status: string) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const image = await imageFor(shotId);
      if (image?.status === status) return image;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Image for ${shotId} did not reach ${status}`);
  };

  assert.equal((await upload(goodShot.id, Uint8Array.from(png), 'frame.png', 'image/png')).status, 202);
  assert.equal((await upload(badShot.id, new TextEncoder().encode('not an image'), 'notes.txt', 'text/plain')).status, 202);
  const ready = await waitFor(goodShot.id, 'ready');
  const failed = await waitFor(badShot.id, 'failed');
  assert.match(failed.error!, /Unsupported file type/);
  assert.ok(ready.previewUrl);
  const preview = await fetch(`${baseUrl}${ready.previewUrl}`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type') ?? '', /image\/webp/);

  assert.equal((await upload(goodShot.id, new TextEncoder().encode('not an image'), 'wrong.txt', 'text/plain')).status, 202);
  const failedReplacement = await waitFor(goodShot.id, 'failed');
  assert.equal(failedReplacement.previousPreviewUrl, ready.previewUrl);
  assert.equal((await fetch(`${baseUrl}${failedReplacement.previousPreviewUrl}`)).status, 200);
  assert.equal((await upload(goodShot.id, Uint8Array.from(png), 'new-frame.png', 'image/png')).status, 202);
  await waitFor(goodShot.id, 'ready');

  const retry = await fetch(`${baseUrl}/api/shots/${badShot.id}/image/retry`, { method: 'POST' });
  assert.equal(retry.status, 202);
  await waitFor(badShot.id, 'failed');
  assert.equal((await imageFor(goodShot.id))?.status, 'ready');

  assert.equal((await upload(badShot.id, new TextEncoder().encode('broken PNG'), 'broken.png', 'image/png')).status, 202);
  const damaged = await waitFor(badShot.id, 'failed');
  assert.match(damaged.error!, /damaged or unreadable/);

  assert.equal((await upload(badShot.id, Uint8Array.from(png), 'replacement.png', 'image/png')).status, 202);
  const replaced = await waitFor(badShot.id, 'ready');
  assert.ok(replaced.previewUrl);
  assert.equal((await imageFor(goodShot.id))?.status, 'ready');

  const reopened = openSceneStore(dataDir);
  assert.equal(reopened.getCurrentImage(goodShot.id)?.status, 'ready');
  assert.equal(reopened.getCurrentImage(badShot.id)?.status, 'ready');
  reopened.close();

  const readyFile = store.getImage(store.getCurrentImage(goodShot.id)!.id)!;
  assert.equal((await fetch(`${baseUrl}/api/shots/${goodShot.id}`, { method: 'DELETE' })).status, 204);
  assert.equal(existsSync(join(dataDir, readyFile.original_path)), false);
  assert.equal(existsSync(join(dataDir, readyFile.preview_path!)), false);
});

test('resumes an interrupted image job when the app restarts', async () => {
  const restartDir = mkdtempSync(join(tmpdir(), 'storyboard-image-restart-'));
  try {
    let connection = openSceneStore(restartDir);
    const scene = connection.create('Restart scene', '');
    const shot = connection.createShot(scene.id, { shotType: 'Wide shot', description: '', notes: '', prompt: '' });
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#293c32' } }).png().toBuffer();
    const id = randomUUID();
    mkdirSync(join(restartDir, 'originals'), { recursive: true });
    writeFileSync(join(restartDir, 'originals', id), png);
    connection.addImage(shot.id, { id, filename: 'restart.png', mimeType: 'image/png', originalPath: join('originals', id) });
    connection.setImageState(id, 'processing');
    connection.close();

    connection = openSceneStore(restartDir);
    createApp(connection, { auth: null });
    for (let attempt = 0; attempt < 80 && connection.getImage(id)?.status !== 'ready'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(connection.getImage(id)?.status, 'ready');
    assert.ok(existsSync(join(restartDir, 'previews', `${id}.webp`)));
    connection.close();
  } finally {
    rmSync(restartDir, { recursive: true, force: true });
  }
});

test('generates and saves a shot prompt from the shot details only, returning the shot to draft', async () => {
  const promptDir = mkdtempSync(join(tmpdir(), 'storyboard-prompt-'));
  const connection = openSceneStore(promptDir);
  const scene = connection.create('The letter outside the café', 'A windy afternoon');
  const shot = connection.createShot(scene.id, { shotType: 'Close-up', description: 'A letter on the table', notes: 'Soft light', prompt: 'Old prompt' });
  connection.updateShot(shot.id, { status: 'approved' });
  let received: { sceneTitle: string; shotDescription: string; imagePath: string | null } | null = null;
  const promptServer = createApp(connection, { auth: null, generatePrompt: async (input) => {
    received = { sceneTitle: input.scene.title, shotDescription: input.shot.description, imagePath: input.imagePath };
    return 'A close-up of the letter in soft afternoon light.';
  } }).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => promptServer.once('listening', resolve));
    const address = promptServer.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server');
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/api/shots/${shot.id}/generate-prompt`, { method: 'POST' });
    assert.equal(response.status, 200);
    const generated = await response.json();
    assert.equal(generated.prompt, 'A close-up of the letter in soft afternoon light.');
    assert.equal(generated.status, 'draft');
    assert.deepEqual(received, { sceneTitle: scene.title, shotDescription: shot.description, imagePath: null });
    assert.equal(connection.getShot(shot.id)?.prompt, generated.prompt);
    assert.equal((await fetch(`${base}/api/shots/missing/generate-prompt`, { method: 'POST' })).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => promptServer.close((error) => error ? reject(error) : resolve()));
    connection.close();
    rmSync(promptDir, { recursive: true, force: true });
  }
});

test('keeps the previous prompt when generation fails', async () => {
  const promptDir = mkdtempSync(join(tmpdir(), 'storyboard-prompt-error-'));
  const connection = openSceneStore(promptDir);
  const scene = connection.create('Scene', '');
  const shot = connection.createShot(scene.id, { shotType: 'Wide', description: '', notes: '', prompt: 'Keep this prompt' });
  const promptServer = createApp(connection, { auth: null, generatePrompt: async () => { throw new PromptGenerationError('OpenRouter is rate-limiting requests.', 429); } }).listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => promptServer.once('listening', resolve));
    const address = promptServer.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP server');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/shots/${shot.id}/generate-prompt`, { method: 'POST' });
    assert.equal(response.status, 429);
    assert.match((await response.json()).error, /rate-limiting/);
    assert.equal(connection.getShot(shot.id)?.prompt, 'Keep this prompt');
  } finally {
    await new Promise<void>((resolve, reject) => promptServer.close((error) => error ? reject(error) : resolve()));
    connection.close();
    rmSync(promptDir, { recursive: true, force: true });
  }
});

test('exports ordered shots as PDF, prompt text, and portable JSON', async () => {
  const scene = store.create('Export café', 'A quiet morning');
  const first = store.createShot(scene.id, { shotType: 'Wide shot', description: 'Outside the café', notes: 'Sunrise', prompt: 'Wide exterior of a café at sunrise.' });
  const second = store.createShot(scene.id, { shotType: 'Close-up', description: 'A letter on the table', notes: 'Still frame', prompt: 'Close view of a letter on a table.' });
  store.updateShot(second.id, { status: 'approved' });
  store.orderShots(scene.id, [second.id, first.id]);
  const imageId = randomUUID();
  mkdirSync(join(dataDir, 'previews'), { recursive: true });
  const previewPath = join('previews', `${imageId}.webp`);
  const preview = await sharp({ create: { width: 640, height: 360, channels: 3, background: '#b46346' } }).webp().toBuffer();
  writeFileSync(join(dataDir, previewPath), preview);
  store.addImage(second.id, { id: imageId, filename: 'letter.png', mimeType: 'image/png', originalPath: join('originals', imageId) });
  store.setImageState(imageId, 'ready', null, previewPath);

  const textResponse = await fetch(`${baseUrl}/api/scenes/${scene.id}/export/txt`);
  assert.equal(textResponse.status, 200);
  assert.match(textResponse.headers.get('content-disposition') ?? '', /export-cafe\.txt/);
  const text = await textResponse.text();
  assert.ok(text.indexOf('Close view of a letter') < text.indexOf('Wide exterior of a café'));
  assert.match(text, /\(approved\)/);
  assert.match(text, /\(draft\)/);

  const jsonResponse = await fetch(`${baseUrl}/api/scenes/${scene.id}/export/json`);
  assert.equal(jsonResponse.status, 200);
  const exported = await jsonResponse.json();
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.scene.title, scene.title);
  assert.deepEqual(exported.shots.map((shot: { id: string }) => shot.id), [second.id, first.id]);
  assert.match(exported.shots[0].image.dataUrl, /^data:image\/webp;base64,/);
  assert.equal(exported.shots[0].image.sourceFilename, 'letter.png');
  assert.equal(exported.shots[0].imageStatus, 'ready');
  assert.equal(exported.shots[1].image, null);

  const pdfResponse = await fetch(`${baseUrl}/api/scenes/${scene.id}/export/pdf`);
  assert.equal(pdfResponse.status, 200);
  assert.match(pdfResponse.headers.get('content-type') ?? '', /application\/pdf/);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.length > 3000);
  assert.equal(pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length, 2);

  assert.equal((await fetch(`${baseUrl}/api/scenes/missing/export/pdf`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/scenes/${scene.id}/export/zip`)).status, 400);
});
