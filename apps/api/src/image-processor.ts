import { mkdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import type { SceneStore, StoredImage } from './scenes.js';

const supportedFormats = new Set(['jpeg', 'png', 'webp']);

class ImageFailure extends Error {}

function failureMessage(error: unknown, image: StoredImage): string {
  if (error instanceof ImageFailure) return error.message;
  const nameLooksSupported = /\.(jpe?g|png|webp)$/i.test(extname(image.filename));
  const mimeLooksSupported = ['image/jpeg', 'image/png', 'image/webp'].includes(image.mime_type);
  if (error instanceof Error && /pixel limit/i.test(error.message)) {
    return 'This image is too large to process. Use an image under 40 megapixels.';
  }
  if (error instanceof Error && 'code' in error && ['ENOENT', 'EACCES', 'EIO'].includes(String(error.code))) {
    return 'Image processing failed. Retry this image or replace the file.';
  }
  return nameLooksSupported || mimeLooksSupported
    ? 'This image appears damaged or unreadable. Replace it with a valid JPEG, PNG, or WebP file.'
    : 'Unsupported file type. Upload a JPEG, PNG, or WebP image.';
}

export function createImageProcessor(store: SceneStore) {
  const waiting: string[] = [];
  const scheduled = new Set<string>();
  let active = 0;

  async function process(id: string) {
    const image = store.getImage(id);
    if (!image) return;
    store.setImageState(id, 'processing');
    const previewRelativePath = join('previews', `${id}.webp`);
    const previewPath = join(store.dataDir, previewRelativePath);
    try {
      const sourcePath = join(store.dataDir, image.original_path);
      const metadata = await sharp(sourcePath, { limitInputPixels: 40_000_000 }).metadata();
      if (!supportedFormats.has(metadata.format ?? '')) {
        throw new ImageFailure('Unsupported file type. Upload a JPEG, PNG, or WebP image.');
      }
      await mkdir(join(store.dataDir, 'previews'), { recursive: true });
      await sharp(sourcePath, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(previewPath);
      if (store.getImage(id)) store.setImageState(id, 'ready', null, previewRelativePath);
      else await rm(previewPath, { force: true });
    } catch (error) {
      await rm(previewPath, { force: true }).catch(() => undefined);
      if (store.getImage(id)) store.setImageState(id, 'failed', failureMessage(error, image));
    }
  }

  function pump() {
    while (active < 2 && waiting.length > 0) {
      const id = waiting.shift()!;
      active += 1;
      void process(id).catch((error: unknown) => {
        console.error('Image job failed:', error);
        if (store.getImage(id)) store.setImageState(id, 'failed', 'Image processing failed. Retry this image or replace the file.');
      }).finally(() => {
        active -= 1;
        scheduled.delete(id);
        if (store.getImage(id)?.status === 'queued') enqueue(id);
        pump();
      });
    }
  }

  function enqueue(id: string) {
    if (scheduled.has(id)) return;
    scheduled.add(id);
    waiting.push(id);
    setImmediate(pump);
  }

  for (const id of store.pendingImageIds()) enqueue(id);

  return { enqueue };
}
