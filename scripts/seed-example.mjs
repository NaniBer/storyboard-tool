import { readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiBase = (process.argv[2] ?? 'http://127.0.0.1:3001/api').replace(/\/$/, '');
const generatePrompts = process.argv.includes('--generate-prompts');
const assetDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'letter-outside-cafe');
const title = 'Example: The letter outside the café';
const description = 'On a rainy evening, Ada finds a sealed letter waiting at a café table. The sequence moves from place, to discovery, to the clue itself.';
const frames = [
  {
    shotType: 'Wide shot',
    description: 'Across the wet street, Ada approaches the blue café. A lone envelope waits on the candlelit outdoor table.',
    notes: 'Establish the geography: Ada enters from the left; the letter is visible on the table before she notices it. Hold for a beat.',
    image: '01-establishing.webp',
  },
  {
    shotType: 'Over the shoulder',
    description: 'From behind Ada, the sealed envelope comes into focus as her hand reaches toward the table.',
    notes: 'Keep her mustard raincoat in the foreground. Shift attention from her hand to the red wax seal.',
    image: '02-discovery.webp',
  },
  {
    shotType: 'Close-up',
    description: 'Ada lifts the rain-speckled envelope. The dark red wax seal fills the frame against warm café reflections.',
    notes: 'End on the unopened seal. Do not show the message yet; this is the scene’s question.',
    image: '03-letter.webp',
  },
];

let cookie = '';
let csrfToken = '';

async function request(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrfToken && init.method && init.method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${body?.error ?? response.statusText}`);
  }
  if (response.status === 204) return null;
  return { response, data: await response.json() };
}

async function waitForImage(shotId) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { data: shots } = await request(`/scenes/${scene.id}/shots`);
    const image = shots.find((shot) => shot.id === shotId)?.image;
    if (image?.status === 'ready') return;
    if (image?.status === 'failed') throw new Error(`Image processing failed: ${image.error ?? 'unknown error'}`);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error('Image processing timed out. Run this script again to check the scene.');
}

const { data: options } = await request('/auth/options');
if (!options.temporaryLogin) throw new Error('Enable AUTH_DEMO_LOGIN and AUTH_DEMO_PASSWORD on the API before seeding.');
const login = await request('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(options.temporaryLogin),
});
cookie = login.response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
csrfToken = login.data.csrfToken;
if (!cookie || !csrfToken) throw new Error('The API did not provide a usable session.');

const { data: scenes } = await request('/scenes');
let scene = scenes.find((candidate) => candidate.title === title);
if (!scene) {
  ({ data: scene } = await request('/scenes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  }));
}

let { data: shots } = await request(`/scenes/${scene.id}/shots`);
for (let index = 0; index < frames.length; index++) {
  const frame = frames[index];
  let shot = shots[index];
  if (!shot) {
    ({ data: shot } = await request(`/scenes/${scene.id}/shots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shotType: frame.shotType, description: frame.description, notes: frame.notes }),
    }));
    shots.push(shot);
  }
  if (shot.image?.status !== 'ready') {
    const form = new FormData();
    form.append('file', new Blob([await readFile(join(assetDir, frame.image))], { type: 'image/webp' }), basename(frame.image));
    await request(`/shots/${shot.id}/image`, { method: 'POST', body: form });
    await waitForImage(shot.id);
  }
  if (generatePrompts && !shot.prompt) {
    try {
      ({ data: shot } = await request(`/shots/${shot.id}/generate-prompt`, { method: 'POST' }));
      await request(`/shots/${shot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
    } catch (error) {
      console.warn(`Prompt for shot ${index + 1} was not generated: ${error.message}`);
    }
  }
  console.log(`Shot ${index + 1}: image ready${shot.prompt ? ', prompt approved' : ''}`);
}

const pdf = await fetch(`${apiBase}/scenes/${scene.id}/export/pdf`, { headers: { Cookie: cookie } });
if (!pdf.ok || pdf.headers.get('content-type')?.includes('application/pdf') !== true) {
  throw new Error(`PDF export check failed (${pdf.status}).`);
}
console.log(`Example ready: ${title}`);
console.log(`Scene ID: ${scene.id}`);
