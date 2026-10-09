import { readFile } from 'node:fs/promises';
import type { Scene, Shot } from './scenes.js';

export type PromptInput = {
  scene: Scene;
  shot: Shot;
  imagePath: string | null;
};

export class PromptGenerationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

type Options = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

function parseModels(value: string | undefined, fallback: string): string[] {
  const list = (value ?? fallback)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length ? list : [fallback];
}

export async function generateShotPrompt(
  { scene, shot, imagePath }: PromptInput,
  { apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free', fetchImpl = fetch }: Options = {},
): Promise<string> {
  if (!apiKey) {
    throw new PromptGenerationError('Add OPENROUTER_API_KEY to the server .env file, then try again.', 503);
  }

  const details = [
    `Scene: ${scene.title}`,
    scene.description && `Scene context: ${scene.description}`,
    `Shot type: ${shot.shotType || 'Unspecified'}`,
    shot.description && `What happens: ${shot.description}`,
    shot.notes && `Notes: ${shot.notes}`,
  ].filter(Boolean).join('\n');

  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: `Write one production-ready visual prompt for this storyboard shot. Use these details as the source of truth:\n${details}` },
  ];
  if (imagePath) {
    try {
      const image = await readFile(imagePath);
      content.push({ type: 'image_url', image_url: { url: `data:image/webp;base64,${image.toString('base64')}` } });
    } catch {
      throw new PromptGenerationError('The image preview is unavailable. Replace the image and try again.', 409);
    }
  }

  const messages = [
    { role: 'system', content: 'You write concise, vivid prompts for visual storyboard frames. Honor the supplied scene and shot details. If an image is supplied, use its visible details as a reference without inventing unseen facts. Include subject, action, framing, setting, and relevant lighting or mood when supported. Return only the prompt text, without a heading, quotation marks, or commentary.' },
    { role: 'user', content },
  ] as const;

  class Fatal extends Error {
    constructor(public readonly error: PromptGenerationError) { super(error.message); }
  }

  async function attempt(candidate: string): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Storyboard Tool',
        },
        body: JSON.stringify({
          model: candidate,
          max_tokens: 1200,
          messages,
        }),
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new PromptGenerationError('Could not reach OpenRouter. Check the connection and try again.', 502);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Fatal(new PromptGenerationError('OpenRouter rejected the API key. Check OPENROUTER_API_KEY on the server.', 502));
      }
      // 429 / 5xx / anything else: fall through to the next model.
      throw new PromptGenerationError(`Model ${candidate} is unavailable (HTTP ${response.status}).`, 502);
    }

    const payload: unknown = await response.json().catch(() => null);
    const choice = payload && typeof payload === 'object' && 'choices' in payload && Array.isArray(payload.choices)
      ? payload.choices[0] : null;
    const message = choice && typeof choice === 'object' && 'message' in choice ? choice.message : null;
    const contentValue = message && typeof message === 'object' && 'content' in message ? message.content : null;
    const generated = typeof contentValue === 'string'
      ? contentValue.trim()
      : Array.isArray(contentValue) ? contentValue.filter((part): part is { type: 'text'; text: string } => part?.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('\n').trim() : '';
    if (!generated) throw new PromptGenerationError(`Model ${candidate} returned an empty prompt.`, 502);
    return generated.slice(0, 4000);
  }

  const models = parseModels(model, 'nvidia/nemotron-3-super-120b-a12b:free');
  let lastError: PromptGenerationError | null = null;
  for (const candidate of models) {
    try {
      return await attempt(candidate);
    } catch (error) {
      if (error instanceof Fatal) throw error.error;
      if (error instanceof PromptGenerationError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new PromptGenerationError('OpenRouter could not generate a prompt. Try again shortly.', 502);
}
