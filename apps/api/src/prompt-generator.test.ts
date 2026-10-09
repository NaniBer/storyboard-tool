import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { generateShotPrompt, PromptGenerationError } from './prompt-generator.js';
import type { Scene, Shot } from './scenes.js';

const scene = { id: 'scene', title: 'The letter outside the café', description: 'Windy afternoon' } as Scene;
const shot = { id: 'shot', sceneId: 'scene', shotType: 'Close-up', description: 'A letter on the table', notes: 'Soft light' } as Shot;

test('sends shot details to OpenRouter as text only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'storyboard-openrouter-'));
  try {
    let url = '';
    let headers: Headers | null = null;
    let body: any;
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input);
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'A cinematic close-up of a letter on a café table.' } }] }), { status: 200 });
    };
    const result = await generateShotPrompt({ scene, shot, imagePath: null }, { apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });
    assert.equal(result, 'A cinematic close-up of a letter on a café table.');
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal((headers as Headers | null)?.get('authorization'), 'Bearer test-key');
    assert.equal(body.model, 'nvidia/nemotron-3-super-120b-a12b:free');
    assert.match(body.messages[1].content[0].text, /A letter on the table/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('explains a missing key and provider rate limit', async () => {
  await assert.rejects(
    generateShotPrompt({ scene, shot, imagePath: null }, { apiKey: '' }),
    (error: unknown) => error instanceof PromptGenerationError && error.status === 503 && /OPENROUTER_API_KEY/.test(error.message),
  );
  await assert.rejects(
    generateShotPrompt({ scene, shot, imagePath: null }, { apiKey: 'test-key', fetchImpl: (async () => new Response('{}', { status: 429 })) as typeof fetch }),
    (error: unknown) => error instanceof PromptGenerationError,
  );
  await assert.rejects(
    generateShotPrompt(
      { scene, shot, imagePath: null },
      {
        apiKey: 'test-key',
        model: 'broken-a:free,broken-b:free',
        fetchImpl: (async () => new Response('{}', { status: 429 })) as typeof fetch,
      },
    ),
    (error: unknown) => error instanceof PromptGenerationError && error.status === 502 && /broken-b/.test(error.message),
  );
});
