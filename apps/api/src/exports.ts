import { readFile } from 'node:fs/promises';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import type { Scene, Shot } from './scenes.js';

export type ExportShot = { shot: Shot; previewPath: string | null; imageFilename: string | null };

export function exportFilename(scene: Scene, extension: 'pdf' | 'txt' | 'json'): string {
  const stem = scene.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'storyboard';
  return `${stem}.${extension}`;
}

export function createPromptsText(scene: Scene, shots: Shot[]): string {
  const lines = [`${scene.title} - Shot prompts`, ''];
  const withPrompts = shots.filter((shot) => shot.prompt.trim());
  if (!withPrompts.length) lines.push('No prompts generated yet.');
  for (const shot of withPrompts) {
    lines.push(`Shot ${shot.position + 1} - ${shot.shotType || 'Untitled shot'} (${shot.status})`);
    lines.push(shot.prompt.trim(), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export async function createStoryboardJson(scene: Scene, shots: ExportShot[]): Promise<string> {
  const exportedShots = await Promise.all(shots.map(async ({ shot, previewPath, imageFilename }) => {
    let image: { sourceFilename: string; mediaType: 'image/webp'; dataUrl: string } | null = null;
    if (previewPath) {
      try {
        const bytes = await readFile(previewPath);
        image = { sourceFilename: imageFilename ?? 'image', mediaType: 'image/webp', dataUrl: `data:image/webp;base64,${bytes.toString('base64')}` };
      } catch { /* A missing preview should not block exporting the other shots. */ }
    }
    return {
      id: shot.id,
      position: shot.position,
      shotType: shot.shotType,
      description: shot.description,
      notes: shot.notes,
      prompt: shot.prompt,
      status: shot.status,
      imageStatus: shot.image?.status ?? null,
      imageError: shot.image?.error ?? null,
      image,
    };
  }));
  return `${JSON.stringify({ schemaVersion: 1, scene: { id: scene.id, title: scene.title, description: scene.description }, shots: exportedShots }, null, 2)}\n`;
}

export async function createStoryboardPdf(scene: Scene, shots: ExportShot[]): Promise<Buffer> {
  const document = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: false, bufferPages: true });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });

  const pageWidth = 595.28;
  const contentWidth = pageWidth - 96;
  const drawHeader = () => {
    document.font('Helvetica-Bold').fontSize(9).fillColor('#a3573c').text('STORYBOARD', 48, 44, { width: contentWidth });
    document.font('Times-Roman').fontSize(21).fillColor('#293c32').text(scene.title, 48, 61, { width: contentWidth });
    document.moveTo(48, Math.max(document.y + 12, 102)).lineTo(pageWidth - 48, Math.max(document.y + 12, 102)).strokeColor('#ded8d0').stroke();
    document.y = Math.max(document.y + 22, 124);
  };
  const drawSection = (label: string, value: string) => {
    if (document.y > document.page.height - 115) document.addPage();
    document.font('Helvetica-Bold').fontSize(9).fillColor('#a3573c').text(label.toUpperCase(), 48, document.y, { width: contentWidth });
    document.moveDown(0.35);
    document.font('Helvetica').fontSize(11).fillColor('#39342f').text(value, 48, document.y, { width: contentWidth, lineGap: 3 });
    document.moveDown(1.1);
  };

  if (!shots.length) {
    document.addPage();
    drawHeader();
    drawSection('Scene', scene.description || 'No scene description added yet.');
    drawSection('Shots', 'No shots have been added yet.');
  }

  for (const [index, { shot, previewPath }] of shots.entries()) {
    document.addPage();
    drawHeader();
    document.font('Helvetica-Bold').fontSize(10).fillColor('#a3573c').text(`SHOT ${String(index + 1).padStart(2, '0')}`, 48, document.y);
    document.font('Times-Roman').fontSize(22).fillColor('#272523').text(shot.shotType || 'Untitled shot', 48, document.y + 4, { width: contentWidth - 100 });
    document.font('Helvetica-Bold').fontSize(9).fillColor(shot.status === 'approved' ? '#406c4d' : '#77664b')
      .text(shot.status.toUpperCase(), pageWidth - 142, document.y - 20, { width: 94, align: 'right' });
    const imageY = Math.max(document.y + 16, 187);
    const imageHeight = 262;
    document.rect(48, imageY, contentWidth, imageHeight).fill('#f1ede6');
    let imageAdded = false;
    if (previewPath) {
      try {
        const jpeg = await sharp(previewPath).jpeg({ quality: 86 }).toBuffer();
        document.image(jpeg, 48, imageY, { fit: [contentWidth, imageHeight], align: 'center', valign: 'center' });
        imageAdded = true;
      } catch { /* Keep the placeholder if the preview is unavailable. */ }
    }
    if (!imageAdded) document.font('Times-Italic').fontSize(15).fillColor('#766e64').text('No image available', 48, imageY + 120, { width: contentWidth, align: 'center' });
    document.y = imageY + imageHeight + 23;
    drawSection('Description', shot.description || 'No description added yet.');
    if (shot.notes) drawSection('Notes', shot.notes);
    if (shot.status === 'approved' && shot.prompt.trim()) drawSection('Approved prompt', shot.prompt.trim());
  }

  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    document.switchToPage(index);
    document.page.margins.bottom = 0;
    document.font('Helvetica').fontSize(9).fillColor('#706b64')
      .text(`Storyboard Tool  /  ${index + 1} of ${range.count}`, 48, document.page.height - 35, { width: contentWidth, align: 'right' });
    document.page.margins.bottom = 48;
  }
  document.end();
  return completed;
}
