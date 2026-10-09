import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { createImageProcessor } from './image-processor.js';
import { generateShotPrompt, PromptGenerationError, type PromptInput } from './prompt-generator.js';
import { createPromptsText, createStoryboardJson, createStoryboardPdf, exportFilename, type ExportShot } from './exports.js';
import type { SceneStore } from './scenes.js';
import { installAuth, type AuthConfig } from './auth.js';

const title = z.string().trim().min(1, 'Title is required').max(120, 'Title must be 120 characters or fewer');
const description = z.string().trim().max(2000, 'Description must be 2000 characters or fewer');
const createScene = z.object({ title, description: description.optional() });
const updateScene = z.object({ title: title.optional(), description: description.optional() }).refine(
  (body) => body.title !== undefined || body.description !== undefined,
  { message: 'Provide a title or description' },
);
const orderScenes = z.object({ ids: z.array(z.string()) });
const shotType = z.string().trim().max(80, 'Shot type must be 80 characters or fewer');
const shotDescription = z.string().trim().max(2000, 'Description must be 2000 characters or fewer');
const notes = z.string().trim().max(4000, 'Notes must be 4000 characters or fewer');
const prompt = z.string().trim().max(4000, 'Prompt must be 4000 characters or fewer');
const shotStatus = z.enum(['draft', 'approved']);
const createShot = z.object({
  shotType: shotType.optional(),
  description: shotDescription.optional(),
  notes: notes.optional(),
  prompt: prompt.optional(),
});
const updateShot = z.object({
  shotType: shotType.optional(),
  description: shotDescription.optional(),
  notes: notes.optional(),
  prompt: prompt.optional(),
  status: shotStatus.optional(),
}).refine((body) => Object.keys(body).length > 0, { message: 'Provide a shot field to update' });
const orderShots = z.object({ ids: z.array(z.string()) });

export function createApp(store: SceneStore, options: { auth: AuthConfig | null; generatePrompt?: (input: PromptInput) => Promise<string> }) {
  if (!options.auth && process.env.NODE_ENV === 'production') throw new Error('Authentication is required in production.');
  const generatePrompt = options.generatePrompt ?? generateShotPrompt;
  const app = express();
  const processor = createImageProcessor(store);
  const originalsDir = join(store.dataDir, 'originals');
  mkdirSync(originalsDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: originalsDir,
      filename: (_request, _file, callback) => callback(null, randomUUID()),
    }),
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  });
  app.use(express.json());

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  if (options.auth) installAuth(app, store, options.auth);

  app.get('/api/scenes', (_request, response) => {
    response.json(store.list());
  });

  app.post('/api/scenes', (request, response) => {
    const parsed = createScene.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid scene' });
      return;
    }
    response.status(201).json(store.create(parsed.data.title, parsed.data.description ?? ''));
  });

  app.put('/api/scenes/order', (request, response) => {
    const parsed = orderScenes.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: 'Provide all scene IDs in the requested order' });
      return;
    }
    const scenes = store.orderScenes(parsed.data.ids);
    if (!scenes) {
      response.status(400).json({ error: 'Order must include every scene exactly once' });
      return;
    }
    response.json(scenes);
  });

  app.get('/api/scenes/:id', (request, response) => {
    const scene = store.get(String(request.params.id));
    if (!scene) {
      response.status(404).json({ error: 'Scene not found' });
      return;
    }
    response.json(scene);
  });

  app.get('/api/scenes/:id/export/:format', async (request, response) => {
    const scene = store.get(String(request.params.id));
    if (!scene) {
      response.status(404).json({ error: 'Scene not found' });
      return;
    }
    const format = String(request.params.format);
    if (format !== 'pdf' && format !== 'txt' && format !== 'json') {
      response.status(400).json({ error: 'Choose PDF, prompts text, or JSON.' });
      return;
    }
    const shots = store.listShots(scene.id);
    const exports: ExportShot[] = shots.map((shot) => {
      const image = store.getLatestReadyImage(shot.id);
      return {
        shot,
        previewPath: image?.preview_path ? join(store.dataDir, image.preview_path) : null,
        imageFilename: image?.filename ?? null,
      };
    });
    try {
      response.setHeader('Content-Disposition', `attachment; filename="${exportFilename(scene, format)}"`);
      response.setHeader('Cache-Control', 'no-store');
      if (format === 'pdf') {
        response.type('application/pdf').send(await createStoryboardPdf(scene, exports));
      } else if (format === 'txt') {
        response.type('text/plain; charset=utf-8').send(createPromptsText(scene, shots));
      } else {
        response.type('application/json; charset=utf-8').send(await createStoryboardJson(scene, exports));
      }
    } catch (error) {
      console.error('Could not export storyboard:', error);
      if (!response.headersSent) response.status(500).json({ error: 'Could not export this scene. Try again.' });
    }
  });

  app.patch('/api/scenes/:id', (request, response) => {
    const parsed = updateScene.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid scene' });
      return;
    }
    const scene = store.update(String(request.params.id), parsed.data);
    if (!scene) {
      response.status(404).json({ error: 'Scene not found' });
      return;
    }
    response.json(scene);
  });

  app.delete('/api/scenes/:id', async (request, response) => {
    const sceneId = String(request.params.id);
    const imagePaths = store.deleteScene(sceneId);
    if (!imagePaths) {
      response.status(404).json({ error: 'Scene not found' });
      return;
    }
    await Promise.all(imagePaths.map((path) => rm(join(store.dataDir, path), { force: true }).catch((error: unknown) => {
      console.error('Could not remove scene image file:', error);
    })));
    response.status(204).end();
  });

  app.get('/api/scenes/:sceneId/shots', (request, response) => {
    const sceneId = String(request.params.sceneId);
    if (!store.get(sceneId)) {
      response.status(404).json({ error: 'Scene not found' });
      return;
    }
    response.json(store.listShots(sceneId));
  });

  app.post('/api/scenes/:sceneId/shots', (request, response) => {
    const sceneId = String(request.params.sceneId);
    if (!store.get(sceneId)) {
      response.status(404).json({ error: 'Scene not found' });
      return;
    }
    const parsed = createShot.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid shot' });
      return;
    }
    response.status(201).json(store.createShot(sceneId, {
      shotType: parsed.data.shotType ?? '',
      description: parsed.data.description ?? '',
      notes: parsed.data.notes ?? '',
      prompt: parsed.data.prompt ?? '',
    }));
  });

  app.patch('/api/shots/:id', (request, response) => {
    const parsed = updateShot.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid shot' });
      return;
    }
    const shot = store.updateShot(String(request.params.id), parsed.data);
    if (!shot) {
      response.status(404).json({ error: 'Shot not found' });
      return;
    }
    response.json(shot);
  });

  app.post('/api/shots/:id/generate-prompt', async (request, response) => {
    const shot = store.getShot(String(request.params.id));
    if (!shot) {
      response.status(404).json({ error: 'Shot not found' });
      return;
    }
    const scene = store.get(shot.sceneId)!;
    try {
      const text = await generatePrompt({ scene, shot, imagePath: null });
      if (!text.trim()) throw new PromptGenerationError('OpenRouter returned an empty prompt. Try again.', 502);
      const updated = store.updateShot(shot.id, { prompt: text.trim().slice(0, 4000), status: 'draft' });
      if (!updated) {
        response.status(404).json({ error: 'Shot not found' });
        return;
      }
      response.json(updated);
    } catch (error) {
      if (error instanceof PromptGenerationError) {
        response.status(error.status).json({ error: error.message });
        return;
      }
      console.error('Could not generate shot prompt:', error);
      response.status(502).json({ error: 'Could not generate a prompt. Try again.' });
    }
  });

  app.put('/api/scenes/:sceneId/shots/order', (request, response) => {
    const sceneId = String(request.params.sceneId);
    if (!store.get(sceneId)) {
      response.status(404).json({ error: 'Scene not found' });
      return;
    }
    const parsed = orderShots.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid shot order' });
      return;
    }
    const shots = store.orderShots(sceneId, parsed.data.ids);
    if (!shots) {
      response.status(400).json({ error: 'Shot order must contain every shot in this scene exactly once' });
      return;
    }
    response.json(shots);
  });

  app.post('/api/shots/:id/image', (request, response, next) => {
    if (!store.getShot(String(request.params.id))) {
      response.status(404).json({ error: 'Shot not found' });
      return;
    }
    next();
  }, upload.single('file'), (request, response) => {
    const file = request.file;
    if (!file) {
      response.status(400).json({ error: 'Choose a file to upload.' });
      return;
    }
    const shotId = String(request.params.id);
    const image = store.addImage(shotId, {
      id: file.filename,
      filename: basename(file.originalname).slice(0, 255) || 'image',
      mimeType: file.mimetype,
      originalPath: join('originals', file.filename),
    });
    processor.enqueue(image.id);
    response.status(202).json(store.getShot(shotId));
  });

  app.post('/api/shots/:id/image/retry', (request, response) => {
    const shotId = String(request.params.id);
    if (!store.getShot(shotId)) {
      response.status(404).json({ error: 'Shot not found' });
      return;
    }
    const image = store.getCurrentImage(shotId);
    if (!image || image.status !== 'failed') {
      response.status(409).json({ error: 'There is no failed image to retry.' });
      return;
    }
    store.setImageState(image.id, 'queued');
    processor.enqueue(image.id);
    response.status(202).json(store.getShot(shotId));
  });

  app.get('/api/images/:id/preview', (request, response) => {
    const image = store.getImage(String(request.params.id));
    if (!image || image.status !== 'ready' || !image.preview_path) {
      response.status(404).json({ error: 'Preview not found' });
      return;
    }
    response.setHeader('Cache-Control', 'private, no-store');
    response.sendFile(join(store.dataDir, image.preview_path));
  });

  app.delete('/api/shots/:id', async (request, response) => {
    const shotId = String(request.params.id);
    const files = store.imageFilesForShot(shotId);
    if (!store.deleteShot(shotId)) {
      response.status(404).json({ error: 'Shot not found' });
      return;
    }
    await Promise.all(files.map((path) => rm(join(store.dataDir, path), { force: true }).catch((error: unknown) => {
      console.error('Could not remove shot image file:', error);
    })));
    response.status(204).end();
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
      response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error: error.code === 'LIMIT_FILE_SIZE'
          ? 'This file is over 20 MB. Choose a smaller image.'
          : 'Upload one image file at a time.',
      });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    console.error(error);
    response.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
