import { useEffect, useState, type FormEvent } from 'react';
import { imageUrl, sceneApi, shotApi, type Shot, type ShotChanges } from './api';

const shotTypes = ['Wide shot', 'Medium shot', 'Close-up', 'Extreme close-up', 'Over the shoulder', 'Point of view'];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type ShotCardProps = {
  shot: Shot;
  number: number;
  first: boolean;
  last: boolean;
  busy: boolean;
  onSave: (changes: ShotChanges) => Promise<Shot>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onRemove: () => Promise<void>;
  onUploadImage: (file: File) => Promise<void>;
  onRetryImage: () => Promise<void>;
  onGeneratePrompt: () => Promise<void>;
};

function ShotCard({ shot, number, first, last, busy, onSave, onMove, onRemove, onUploadImage, onRetryImage, onGeneratePrompt }: ShotCardProps) {
  const [shotType, setShotType] = useState(shot.shotType);
  const [customType, setCustomType] = useState(shotTypes.includes(shot.shotType) ? '' : shot.shotType);
  const [description, setDescription] = useState(shot.description);
  const [notes, setNotes] = useState(shot.notes);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const customSelected = !shotTypes.includes(shotType);
  const dirty = shotType !== shot.shotType || description !== shot.description || notes !== shot.notes;
  const fieldId = (name: string) => `shot-${shot.id}-${name}`;

  async function save(changes: ShotChanges) {
    setError(null);
    try {
      const updated = await onSave(changes);
      setShotType(updated.shotType);
      if (!shotTypes.includes(updated.shotType)) setCustomType(updated.shotType);
      setDescription(updated.description);
      setNotes(updated.notes);
    } catch (cause) {
      setError(errorMessage(cause, 'Could not save this shot.'));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dirty || busy) return;
    void save({ shotType: shotType.trim(), description: description.trim(), notes: notes.trim() });
  }

  async function setStatus(status: Shot['status']) {
    await save({ shotType: shotType.trim(), description: description.trim(), notes: notes.trim(), status });
  }

  async function move(direction: -1 | 1) {
    setError(null);
    try { await onMove(direction); }
    catch (cause) { setError(errorMessage(cause, 'Could not move this shot.')); }
  }

  async function remove() {
    if (!window.confirm(`Remove shot ${number}? This cannot be undone.`)) return;
    setError(null);
    try { await onRemove(); }
    catch (cause) { setError(errorMessage(cause, 'Could not remove this shot.')); }
  }

  async function uploadImage(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      setImageError('This file is over 20 MB. Choose a smaller image.');
      return;
    }
    setImageBusy(true);
    setImageError(null);
    try { await onUploadImage(file); }
    catch (cause) { setImageError(errorMessage(cause, 'Could not upload this image. Try again.')); }
    finally { setImageBusy(false); }
  }

  async function retryImage() {
    setImageBusy(true);
    setImageError(null);
    try { await onRetryImage(); }
    catch (cause) { setImageError(errorMessage(cause, 'Could not retry this image. Try replacing it.')); }
    finally { setImageBusy(false); }
  }

  async function generatePrompt() {
    setPromptBusy(true);
    setPromptError(null);
    try {
      if (dirty) await onSave({ shotType: shotType.trim(), description: description.trim(), notes: notes.trim() });
      await onGeneratePrompt();
    } catch (cause) {
      setPromptError(errorMessage(cause, 'Could not generate a prompt. Try again.'));
    } finally {
      setPromptBusy(false);
    }
  }

  const image = shot.image;
  const previewPath = image?.previewUrl ?? image?.previousPreviewUrl;
  const processing = image?.status === 'queued' || image?.status === 'processing';

  return (
    <article className="shot-card" aria-labelledby={fieldId('heading')}>
      <div className="shot-card-header">
        <div className="shot-card-title"><span className="shot-number">{String(number).padStart(2, '0')}</span><div><p className="shot-eyebrow">Shot {number}</p><h3 id={fieldId('heading')}>{shot.shotType || 'Untitled shot'}</h3></div></div>
        <span className={`shot-status ${shot.status}`}>{shot.status}</span>
      </div>
      <div className="shot-media">
        <div className="shot-media-frame">
          {previewPath ? <img src={imageUrl(previewPath)} alt={`Reference for shot ${number}`} /> : <div className="shot-media-placeholder"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="2" /><circle cx="11" cy="12" r="2" /><path d="m5 24 7-7 5 5 4-4 6 6" /></svg><span>No image yet</span></div>}
          {processing && <span className="image-processing" role="status">Processing image…</span>}
        </div>
        <div className="shot-media-details">
          <div>
            <p className="shot-media-title">Reference image</p>
            <p className="shot-media-caption">{image ? image.filename : 'Add a sketch, photo, or reference frame.'}</p>
            {image?.status === 'ready' && <p className="image-state ready" role="status">Preview ready</p>}
            {image?.status === 'failed' && <p className="image-state failed" role="alert">{image.error ?? 'This image could not be processed.'}{image.previousPreviewUrl ? ' Your previous image is still available.' : ''}</p>}
            {imageBusy && <p className="image-state" role="status">Uploading image…</p>}
          </div>
          <div className="shot-media-controls">
            <label className={`secondary-button image-upload-button${imageBusy ? ' disabled' : ''}`}>
              {image ? 'Replace image' : 'Upload image'}
              <input type="file" accept="image/*" disabled={imageBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadImage(file); }} aria-label={`${image ? 'Replace' : 'Upload'} image for shot ${number}`} />
            </label>
            {image?.status === 'failed' && <button className="quiet-button" type="button" onClick={() => void retryImage()} disabled={imageBusy}>Retry processing</button>}
          </div>
          {imageError && <p className="image-state failed" role="alert">{imageError}</p>}
          <p className="image-format-hint">JPEG, PNG, or WebP · up to 20 MB</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className="shot-fields">
          <fieldset className="shot-type-field">
            <legend>Shot type</legend>
            <div className="shot-type-options">
              {shotTypes.map((type) => (
                <label className="shot-type-option" key={type}>
                  <input type="radio" name={fieldId('type')} value={type} checked={shotType === type} onChange={() => setShotType(type)} disabled={busy} />
                  <span>{type}</span>
                </label>
              ))}
              <label className="shot-type-option">
                <input type="radio" name={fieldId('type')} value="custom" checked={customSelected} onChange={() => setShotType(customType)} disabled={busy} />
                <span>Custom</span>
              </label>
            </div>
            {customSelected && <div className="field custom-shot-type"><label htmlFor={fieldId('custom-type')}>Custom shot type</label><input id={fieldId('custom-type')} type="text" value={customType} onChange={(event) => { setCustomType(event.target.value); setShotType(event.target.value); }} maxLength={80} placeholder="Describe the framing" disabled={busy} /></div>}
          </fieldset>
          <div className="field"><label htmlFor={fieldId('description')}>Description</label><textarea id={fieldId('description')} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={2000} placeholder="What do we see in this shot?" disabled={busy} /></div>
          <div className="field"><label htmlFor={fieldId('notes')}>Notes <span className="optional">Optional</span></label><textarea id={fieldId('notes')} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={4000} placeholder="Camera movement, timing, or collaborator notes" disabled={busy} /></div>
        </div>
        <div className="shot-prompt">
          <div className="shot-prompt-heading"><div><h4>Visual prompt</h4><p>Generate from this shot’s details and reference image.</p></div><button type="button" className="secondary-button" onClick={() => void generatePrompt()} disabled={busy || promptBusy}>{promptBusy ? 'Generating…' : shot.prompt ? 'Regenerate prompt' : 'Generate prompt'}</button></div>
          {shot.prompt && <p className="shot-prompt-text">{shot.prompt}</p>}
          {promptError && <p className="image-state failed" role="alert">{promptError}</p>}
        </div>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="shot-actions">
          <div className="shot-order" aria-label={`Reorder shot ${number}`}>
            <button type="button" className="quiet-button" onClick={() => void move(-1)} disabled={busy || first} aria-label={`Move shot ${number} up`}>↑ <span>Up</span></button>
            <button type="button" className="quiet-button" onClick={() => void move(1)} disabled={busy || last} aria-label={`Move shot ${number} down`}>↓ <span>Down</span></button>
          </div>
          <div className="shot-main-actions">
            <button type="button" className="quiet-button danger-button" onClick={() => void remove()} disabled={busy}>Remove</button>
            <button type="button" className="secondary-button" onClick={() => void setStatus(shot.status === 'draft' ? 'approved' : 'draft')} disabled={busy}>{shot.status === 'draft' ? 'Approve shot' : 'Move to draft'}</button>
            <button type="submit" className="primary-button" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save shot'}</button>
          </div>
        </div>
        {dirty && <p className="shot-unsaved" role="status">Unsaved changes</p>}
      </form>
    </article>
  );
}

function ShotPreviewCard({ shot, number }: { shot: Shot; number: number }) {
  const image = shot.image;
  const previewPath = image?.previewUrl ?? image?.previousPreviewUrl;
  const processing = image?.status === 'queued' || image?.status === 'processing';

  return (
    <article className="board-shot" aria-label={`Shot ${number}: ${shot.shotType || 'Untitled shot'}`}>
      <div className="board-shot-frame">
        {previewPath
          ? <img src={imageUrl(previewPath)} alt={`Reference for shot ${number}`} />
          : <div className="board-shot-placeholder"><span>No image yet</span></div>}
        <span className="board-shot-number">{String(number).padStart(2, '0')}</span>
      </div>
      <div className="board-shot-body">
        <div className="board-shot-heading"><h3>{shot.shotType || 'Untitled shot'}</h3><span className={`shot-status ${shot.status}`}>{shot.status}</span></div>
        <p className="board-shot-description">{shot.description || 'No description added yet.'}</p>
        {shot.notes && <div className="board-shot-notes"><span>Notes</span><p>{shot.notes}</p></div>}
        {shot.prompt && <div className="board-shot-notes"><span>Visual prompt</span><p>{shot.prompt}</p></div>}
        {processing && <p className="board-shot-image-state" role="status">Image processing…</p>}
        {image?.status === 'failed' && <p className="board-shot-image-state failed">Image unavailable: {image.error ?? 'Processing failed.'}{previewPath ? ' Showing the previous image.' : ''}</p>}
      </div>
    </article>
  );
}

export function Shots({ sceneId }: { sceneId: string }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState<'edit' | 'board'>('edit');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    shotApi.list(sceneId).then((result) => { if (active) setShots(result); })
      .catch((cause: unknown) => { if (active) setError(errorMessage(cause, 'Could not load shots.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sceneId, reloadKey]);

  const hasProcessingImage = shots.some((shot) => shot.image?.status === 'queued' || shot.image?.status === 'processing');
  useEffect(() => {
    if (!hasProcessingImage || busy) return;
    let active = true;
    const timer = window.setInterval(() => {
      void shotApi.list(sceneId).then((result) => { if (active) setShots(result); }).catch(() => undefined);
    }, 1200);
    return () => { active = false; window.clearInterval(timer); };
  }, [sceneId, hasProcessingImage, busy]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const created = await shotApi.create(sceneId);
      setShots((previous) => [...previous, created]);
    } catch (cause) { setError(errorMessage(cause, 'Could not add a shot.')); }
    finally { setBusy(false); }
  }

  async function update(id: string, changes: ShotChanges) {
    setBusy(true);
    try {
      const updated = await shotApi.update(id, changes);
      setShots((previous) => previous.map((shot) => shot.id === id ? updated : shot));
      return updated;
    } finally { setBusy(false); }
  }

  async function move(index: number, direction: -1 | 1) {
    const next = [...shots];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    try { setShots(await shotApi.reorder(sceneId, next.map((shot) => shot.id))); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await shotApi.remove(id);
      setShots((previous) => previous.filter((shot) => shot.id !== id));
    } finally { setBusy(false); }
  }

  async function uploadImage(id: string, file: File) {
    const updated = await shotApi.uploadImage(id, file);
    setShots((previous) => previous.map((shot) => shot.id === id ? updated : shot));
  }

  async function retryImage(id: string) {
    const updated = await shotApi.retryImage(id);
    setShots((previous) => previous.map((shot) => shot.id === id ? updated : shot));
  }

  async function generatePrompt(id: string) {
    const updated = await shotApi.generatePrompt(id);
    setShots((previous) => previous.map((shot) => shot.id === id ? updated : shot));
  }

  return (
    <section className="shots-section" aria-labelledby="shots-heading">
      <div className="shots-heading">
        <div><p className="editor-context">Build the sequence</p><h2 id="shots-heading">Shots <span className="shot-count">{shots.length}</span></h2><p>{viewMode === 'board' ? 'Your scene, frame by frame.' : 'Capture each frame, then put the story in order.'}</p></div>
        <div className="shots-heading-actions">
          {shots.length > 0 && <button type="button" className="secondary-button" onClick={() => setViewMode((mode) => mode === 'edit' ? 'board' : 'edit')} aria-pressed={viewMode === 'board'}>{viewMode === 'edit' ? 'View shots' : 'Edit shots'}</button>}
          {viewMode === 'edit' && <button type="button" className="primary-button" onClick={() => void create()} disabled={busy || loading}>+ Add shot</button>}
        </div>
      </div>
      {!loading && !error && shots.length > 0 && <div className="shots-export"><div><h3>Export this scene</h3><p>Downloads use saved shots. The PDF includes approved prompts.</p></div><div className="shots-export-actions"><a className="secondary-button" href={sceneApi.exportUrl(sceneId, 'pdf')}>PDF storyboard</a><a className="secondary-button" href={sceneApi.exportUrl(sceneId, 'txt')}>Prompts .txt</a><a className="secondary-button" href={sceneApi.exportUrl(sceneId, 'json')}>Storyboard .json</a></div></div>}
      {loading && <div className="shot-empty" role="status">Loading shots…</div>}
      {error && <div className="notice error shot-list-error" role="alert">{error} <button type="button" className="text-button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>}
      {!loading && !error && shots.length === 0 && <div className="shot-empty"><div className="empty-frame" aria-hidden="true">01</div><h3>Your first frame starts here.</h3><p>Add a shot to describe what the camera sees.</p><button type="button" className="secondary-button" onClick={() => void create()} disabled={busy}>Add your first shot</button></div>}
      {!loading && shots.length > 0 && <div className="shot-list" hidden={viewMode === 'board'}>{shots.map((shot, index) => <ShotCard key={shot.id} shot={shot} number={index + 1} first={index === 0} last={index === shots.length - 1} busy={busy} onSave={(changes) => update(shot.id, changes)} onMove={(direction) => move(index, direction)} onRemove={() => remove(shot.id)} onUploadImage={(file) => uploadImage(shot.id, file)} onRetryImage={() => retryImage(shot.id)} onGeneratePrompt={() => generatePrompt(shot.id)} />)}</div>}
      {!loading && shots.length > 0 && viewMode === 'board' && <div className="shot-board">{shots.map((shot, index) => <ShotPreviewCard key={shot.id} shot={shot} number={index + 1} />)}</div>}
    </section>
  );
}
