import { tw } from './tailwind-classes';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { imageUrl, sceneApi, shotApi, type Shot, type ShotChanges } from './api';

const ShotFlow = lazy(() => import('./ShotFlow'));

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
  onDirtyChange?: (dirty: boolean) => void;
};

function ShotCard({ shot, number, first, last, busy, onSave, onMove, onRemove, onUploadImage, onRetryImage, onGeneratePrompt, onDirtyChange }: ShotCardProps) {
  const [shotType, setShotType] = useState(shot.shotType);
  const [customType, setCustomType] = useState(shotTypes.includes(shot.shotType) ? '' : shot.shotType);
  const [description, setDescription] = useState(shot.description);
  const [notes, setNotes] = useState(shot.notes);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [promptBusy, setPromptBusy] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const customSelected = !shotTypes.includes(shotType);
  const dirty = shotType !== shot.shotType || description !== shot.description || notes !== shot.notes;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
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
    <article className={"shot-card p-[clamp(24px,_3.7vw,_40px)] [border:1px_solid_#e7e1da] rounded-[12px] bg-[#fff] shadow-[0_12px_28px_-20px_rgba(48,_35,_24,_.22)] [&_h3]:m-0 [&_h3]:[overflow-wrap:anywhere] [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[22px] [&_h3]:font-normal max-[520px]:p-[22px_18px]"} aria-labelledby={fieldId('heading')}>
      <div className={"shot-card-header flex items-start justify-between gap-[18px] pb-[23px] [border-bottom:1px_solid_#eee9e3] max-[520px]:items-center"}>
        <div className={"shot-card-title flex items-center gap-[16px] min-w-0"}><span className={"shot-number grid flex-none place-items-center w-[51px] h-[51px] [border:1px_solid_#e1d6cc] rounded-[6px] text-rust bg-[#f7f3ed] [font-family:Georgia,_'Times_New_Roman',_serif] text-[22px] tabular-nums"}>{String(number).padStart(2, '0')}</span><div><p className={"shot-eyebrow m-[0_0_3px] text-rust text-[11px] font-bold"}>Shot {number}</p><h3 id={fieldId('heading')}>{shot.shotType || 'Untitled shot'}</h3></div></div>
        <span className={tw(`shot-status ${shot.status}`)}>{shot.status}</span>
      </div>
      <div className={"shot-media grid [grid-template-columns:minmax(0,_1.2fr)_minmax(210px,_.8fr)] items-center gap-[24px] pt-[25px] max-[760px]:[grid-template-columns:1fr] max-[760px]:gap-[17px]"}>
        <div className={"shot-media-frame relative grid place-items-center w-full aspect-video overflow-hidden [border:1px_solid_#e4dfd8] rounded-[8px] bg-[#f4f1eb] [&_img]:block [&_img]:w-full [&_img]:h-full [&_img]:object-contain"}>
          {previewPath ? <img src={imageUrl(previewPath)} alt={`Reference for shot ${number}`} /> : <div className={"shot-media-placeholder grid [justify-items:center] gap-[10px] text-[#766e64] text-[12px] [&_svg]:w-[34px] [&_svg]:h-[34px] [&_svg]:text-[#a89c8d]"}><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="2" /><circle cx="11" cy="12" r="2" /><path d="m5 24 7-7 5 5 4-4 6 6" /></svg><span>No image yet</span></div>}
          {processing && <span className={"image-processing absolute [right:10px] [bottom:10px] p-[7px_10px] rounded-[5px] text-ink bg-paper text-[11px] font-bold shadow-[0_3px_12px_rgba(30,_30,_25,_.15)]"} role="status">Processing image…</span>}
        </div>
        <div className={"shot-media-details min-w-0"}>
          <div>
            <p className={"shot-media-title m-[0_0_7px] text-[#39342f] text-[13px] font-bold"}>Reference image</p>
            <p className={"shot-media-caption m-0 [overflow-wrap:anywhere] text-subtle text-[12px] leading-[1.5]"}>{image ? image.filename : 'Add a sketch, photo, or reference frame.'}</p>
            {image?.status === 'ready' && <p className={"image-state m-[10px_0_0] text-muted text-[12px] leading-[1.5] [&.ready]:text-[#406c4d] [&.ready]:font-bold [&.failed]:text-[#9a3e32] ready"} role="status">Preview ready</p>}
            {image?.status === 'failed' && <p className={"image-state m-[10px_0_0] text-muted text-[12px] leading-[1.5] [&.ready]:text-[#406c4d] [&.ready]:font-bold [&.failed]:text-[#9a3e32] failed"} role="alert">{image.error ?? 'This image could not be processed.'}{image.previousPreviewUrl ? ' Your previous image is still available.' : ''}</p>}
            {imageBusy && <p className={"image-state m-[10px_0_0] text-muted text-[12px] leading-[1.5] [&.ready]:text-[#406c4d] [&.ready]:font-bold [&.failed]:text-[#9a3e32]"} role="status">Uploading image…</p>}
          </div>
          <div className={"shot-media-controls flex flex-wrap items-center gap-[8px] mt-[18px]"}>
            <label className={tw(`secondary-button image-upload-button${imageBusy ? ' disabled' : ''}`)}>
              {image ? 'Replace image' : 'Upload image'}
              <input type="file" accept="image/*" disabled={imageBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadImage(file); }} aria-label={`${image ? 'Replace' : 'Upload'} image for shot ${number}`} />
            </label>
            {image?.status === 'failed' && <button className={"quiet-button p-[9px_10px] border-0 rounded-[5px] text-muted bg-transparent text-[12px] font-semibold [&:hover:not(:disabled)]:text-ink [&:hover:not(:disabled)]:bg-[#f0eee9] [&:disabled]:opacity-[.4]"} type="button" onClick={() => void retryImage()} disabled={imageBusy}>Retry processing</button>}
          </div>
          {imageError && <p className={"image-state m-[10px_0_0] text-muted text-[12px] leading-[1.5] [&.ready]:text-[#406c4d] [&.ready]:font-bold [&.failed]:text-[#9a3e32] failed"} role="alert">{imageError}</p>}
          <p className={"image-format-hint m-[12px_0_0] text-subtle text-[11px]"}>JPEG, PNG, or WebP · up to 20 MB</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className={"shot-fields grid gap-[22px] pt-[25px] [&_.field_+_.field]:mt-[0] [&_.field_textarea]:min-h-[96px]"}>
          <fieldset className={"shot-type-field min-w-0 m-0 p-0 border-0 [&_legend]:mb-[11px] [&_legend]:p-0 [&_legend]:text-[#39342f] [&_legend]:text-[13px] [&_legend]:font-bold"}>
            <legend>Shot type</legend>
            <div className={"shot-type-options flex flex-wrap gap-[8px]"}>
              {shotTypes.map((type) => (
                <label className={"shot-type-option relative inline-flex cursor-pointer [&_input]:absolute [&_input]:w-[1px] [&_input]:h-[1px] [&_input]:opacity-[0] [&_span]:inline-flex [&_span]:items-center [&_span]:min-h-[37px] [&_span]:p-[8px_12px] [&_span]:[border:1px_solid_#d4cec6] [&_span]:rounded-[6px] [&_span]:text-[#514b45] [&_span]:bg-[#fff] [&_span]:text-[12px] [&_span]:font-semibold [&_span]:leading-[1.2] [&_span]:[transition:border-color_.18s_ease,_background_.18s_ease,_color_.18s_ease] [&:hover_input:not(:disabled)_+_span]:[border-color:#8a958b] [&:hover_input:not(:disabled)_+_span]:bg-[#f4f5f1] [&_input:checked_+_span]:[border-color:#293c32] [&_input:checked_+_span]:text-[#fff] [&_input:checked_+_span]:bg-ink [&_input:focus-visible_+_span]:[outline:3px_solid_#b46346] [&_input:focus-visible_+_span]:[outline-offset:3px] [&_input:disabled_+_span]:cursor-not-allowed [&_input:disabled_+_span]:opacity-[.55]"} key={type}>
                  <input type="radio" name={fieldId('type')} value={type} checked={shotType === type} onChange={() => setShotType(type)} disabled={busy} />
                  <span>{type}</span>
                </label>
              ))}
              <label className={"shot-type-option relative inline-flex cursor-pointer [&_input]:absolute [&_input]:w-[1px] [&_input]:h-[1px] [&_input]:opacity-[0] [&_span]:inline-flex [&_span]:items-center [&_span]:min-h-[37px] [&_span]:p-[8px_12px] [&_span]:[border:1px_solid_#d4cec6] [&_span]:rounded-[6px] [&_span]:text-[#514b45] [&_span]:bg-[#fff] [&_span]:text-[12px] [&_span]:font-semibold [&_span]:leading-[1.2] [&_span]:[transition:border-color_.18s_ease,_background_.18s_ease,_color_.18s_ease] [&:hover_input:not(:disabled)_+_span]:[border-color:#8a958b] [&:hover_input:not(:disabled)_+_span]:bg-[#f4f5f1] [&_input:checked_+_span]:[border-color:#293c32] [&_input:checked_+_span]:text-[#fff] [&_input:checked_+_span]:bg-ink [&_input:focus-visible_+_span]:[outline:3px_solid_#b46346] [&_input:focus-visible_+_span]:[outline-offset:3px] [&_input:disabled_+_span]:cursor-not-allowed [&_input:disabled_+_span]:opacity-[.55]"}>
                <input type="radio" name={fieldId('type')} value="custom" checked={customSelected} onChange={() => setShotType(customType)} disabled={busy} />
                <span>Custom</span>
              </label>
            </div>
            {customSelected && <div className={"field [&_+_.field]:mt-[30px] [&_label]:block [&_label]:mb-[11px] [&_label]:text-[#39342f] [&_label]:text-[13px] [&_label]:font-bold [&_input]:block [&_input]:w-full [&_input]:p-[14px_15px] [&_input]:[border:1px_solid_#d4cec6] [&_input]:rounded-[6px] [&_input]:[outline:none] [&_input]:text-[#2b2926] [&_input]:bg-[#fff] [&_input]:text-[14px] [&_input]:leading-[1.5] [&_input]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_textarea]:block [&_textarea]:w-full [&_textarea]:p-[14px_15px] [&_textarea]:[border:1px_solid_#d4cec6] [&_textarea]:rounded-[6px] [&_textarea]:[outline:none] [&_textarea]:text-[#2b2926] [&_textarea]:bg-[#fff] [&_textarea]:text-[14px] [&_textarea]:leading-[1.5] [&_textarea]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_input::placeholder]:text-[#78736c] [&_textarea::placeholder]:text-[#78736c] [&_input:hover]:[border-color:#9f968d] [&_textarea:hover]:[border-color:#9f968d] [&_input:focus]:[border-color:#a65a3e] [&_input:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_textarea:focus]:[border-color:#a65a3e] [&_textarea:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_input:disabled]:opacity-[.68] [&_textarea:disabled]:opacity-[.68] [&_textarea]:min-h-[145px] [&_textarea]:[resize:vertical] custom-shot-type max-w-[310px] mt-[16px]"}><label htmlFor={fieldId('custom-type')}>Custom shot type</label><input id={fieldId('custom-type')} type="text" value={customType} onChange={(event) => { setCustomType(event.target.value); setShotType(event.target.value); }} maxLength={80} placeholder="Describe the framing" disabled={busy} /></div>}
          </fieldset>
          <div className={"field [&_+_.field]:mt-[30px] [&_label]:block [&_label]:mb-[11px] [&_label]:text-[#39342f] [&_label]:text-[13px] [&_label]:font-bold [&_input]:block [&_input]:w-full [&_input]:p-[14px_15px] [&_input]:[border:1px_solid_#d4cec6] [&_input]:rounded-[6px] [&_input]:[outline:none] [&_input]:text-[#2b2926] [&_input]:bg-[#fff] [&_input]:text-[14px] [&_input]:leading-[1.5] [&_input]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_textarea]:block [&_textarea]:w-full [&_textarea]:p-[14px_15px] [&_textarea]:[border:1px_solid_#d4cec6] [&_textarea]:rounded-[6px] [&_textarea]:[outline:none] [&_textarea]:text-[#2b2926] [&_textarea]:bg-[#fff] [&_textarea]:text-[14px] [&_textarea]:leading-[1.5] [&_textarea]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_input::placeholder]:text-[#78736c] [&_textarea::placeholder]:text-[#78736c] [&_input:hover]:[border-color:#9f968d] [&_textarea:hover]:[border-color:#9f968d] [&_input:focus]:[border-color:#a65a3e] [&_input:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_textarea:focus]:[border-color:#a65a3e] [&_textarea:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_input:disabled]:opacity-[.68] [&_textarea:disabled]:opacity-[.68] [&_textarea]:min-h-[145px] [&_textarea]:[resize:vertical]"}><label htmlFor={fieldId('description')}>Description</label><textarea id={fieldId('description')} value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={2000} placeholder="What do we see in this shot?" disabled={busy} /></div>
          <div className={"field [&_+_.field]:mt-[30px] [&_label]:block [&_label]:mb-[11px] [&_label]:text-[#39342f] [&_label]:text-[13px] [&_label]:font-bold [&_input]:block [&_input]:w-full [&_input]:p-[14px_15px] [&_input]:[border:1px_solid_#d4cec6] [&_input]:rounded-[6px] [&_input]:[outline:none] [&_input]:text-[#2b2926] [&_input]:bg-[#fff] [&_input]:text-[14px] [&_input]:leading-[1.5] [&_input]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_textarea]:block [&_textarea]:w-full [&_textarea]:p-[14px_15px] [&_textarea]:[border:1px_solid_#d4cec6] [&_textarea]:rounded-[6px] [&_textarea]:[outline:none] [&_textarea]:text-[#2b2926] [&_textarea]:bg-[#fff] [&_textarea]:text-[14px] [&_textarea]:leading-[1.5] [&_textarea]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_input::placeholder]:text-[#78736c] [&_textarea::placeholder]:text-[#78736c] [&_input:hover]:[border-color:#9f968d] [&_textarea:hover]:[border-color:#9f968d] [&_input:focus]:[border-color:#a65a3e] [&_input:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_textarea:focus]:[border-color:#a65a3e] [&_textarea:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_input:disabled]:opacity-[.68] [&_textarea:disabled]:opacity-[.68] [&_textarea]:min-h-[145px] [&_textarea]:[resize:vertical]"}><label htmlFor={fieldId('notes')}>Notes <span className={"optional ml-[5px] text-[#7f7a73] text-[11px] font-normal"}>Optional</span></label><textarea id={fieldId('notes')} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={4000} placeholder="Camera movement, timing, or collaborator notes" disabled={busy} /></div>
        </div>
        <div className={"shot-prompt mt-[28px] p-[21px_22px] rounded-[8px] bg-paper"}>
          <div className={"shot-prompt-heading flex items-center justify-between gap-[18px] [&_h4]:m-0 [&_h4]:text-[#39342f] [&_h4]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h4]:text-[19px] [&_h4]:font-normal [&_p]:m-[6px_0_0] [&_p]:text-subtle [&_p]:text-[12px] [&_p]:leading-[1.5] max-[520px]:items-start max-[520px]:flex-col"}><div><h4>Visual prompt</h4><p>Generate from this shot’s details and reference image.</p></div><button type="button" className={"secondary-button p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]"} onClick={() => void generatePrompt()} disabled={busy || promptBusy}>{promptBusy ? 'Generating…' : shot.prompt ? 'Regenerate prompt' : 'Generate prompt'}</button></div>
          {shot.prompt && <p className={"shot-prompt-text m-[18px_0_0] pt-[16px] [border-top:1px_solid_#e5dfd7] text-[#39342f] text-[13px] leading-[1.65] whitespace-pre-wrap [overflow-wrap:anywhere]"}>{shot.prompt}</p>}
          {promptError && <p className={"image-state m-[10px_0_0] text-muted text-[12px] leading-[1.5] [&.ready]:text-[#406c4d] [&.ready]:font-bold [&.failed]:text-[#9a3e32] failed"} role="alert">{promptError}</p>}
        </div>
        {error && <div className={"notice mt-[23px] p-[12px_14px] rounded-[6px] text-[12px] leading-[1.5] [&.error]:text-[#7d2e24] [&.error]:bg-[#f9eae7] error"} role="alert">{error}</div>}
        <div className={"shot-actions flex flex-wrap items-center justify-between gap-[18px] mt-[27px] pt-[21px] [border-top:1px_solid_#eee9e3]"}>
          <div className={"shot-order flex flex-wrap items-center gap-[8px]"} aria-label={`Reorder shot ${number}`}>
            <button type="button" className={"quiet-button p-[9px_10px] border-0 rounded-[5px] text-muted bg-transparent text-[12px] font-semibold [&:hover:not(:disabled)]:text-ink [&:hover:not(:disabled)]:bg-[#f0eee9] [&:disabled]:opacity-[.4]"} onClick={() => void move(-1)} disabled={busy || first} aria-label={`Move shot ${number} up`}>↑ <span>Up</span></button>
            <button type="button" className={"quiet-button p-[9px_10px] border-0 rounded-[5px] text-muted bg-transparent text-[12px] font-semibold [&:hover:not(:disabled)]:text-ink [&:hover:not(:disabled)]:bg-[#f0eee9] [&:disabled]:opacity-[.4]"} onClick={() => void move(1)} disabled={busy || last} aria-label={`Move shot ${number} down`}>↓ <span>Down</span></button>
          </div>
          <div className={"shot-main-actions flex flex-wrap items-center gap-[8px] max-[520px]:w-full max-[520px]:[&_.primary-button]:ml-[auto]"}>
            <button type="button" className={"quiet-button p-[9px_10px] border-0 rounded-[5px] text-muted bg-transparent text-[12px] font-semibold [&:hover:not(:disabled)]:text-ink [&:hover:not(:disabled)]:bg-[#f0eee9] [&:disabled]:opacity-[.4] danger-button text-[#a34d3d] [&:hover:not(:disabled)]:text-[#81372c] [&:hover:not(:disabled)]:bg-[#f9eae7]"} onClick={() => setConfirmRemove(true)} disabled={busy} aria-expanded={confirmRemove} aria-controls={fieldId('remove-confirmation')}>Remove</button>
            <button type="button" className={"secondary-button p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]"} onClick={() => void setStatus(shot.status === 'draft' ? 'approved' : 'draft')} disabled={busy}>{shot.status === 'draft' ? 'Approve shot' : 'Move to draft'}</button>
            <button type="submit" className={"primary-button inline-flex items-center justify-center gap-[13px] min-h-[43px] p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-[#fff] bg-ink text-[12px] font-bold whitespace-nowrap transition-[background,transform] duration-[180ms] [&:hover:not(:disabled)]:bg-[#3f5849] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&:disabled]:opacity-[.5] [&_svg]:w-[17px] [&_svg]:h-[17px] max-[520px]:[align-self:flex-start]"} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save shot'}</button>
          </div>
        </div>
        {confirmRemove && <div id={fieldId('remove-confirmation')} className="mt-[16px] rounded-[8px] bg-[#f9eae7] p-[15px] text-[12px] text-[#6f3028]" role="group" aria-label={`Confirm removal of shot ${number}`}>
          <p className="m-0 leading-[1.5]">Remove shot {number}? Its image and notes will be deleted. This cannot be undone.</p>
          <div className="mt-[12px] flex flex-wrap gap-[8px]">
            <button type="button" className="rounded-[5px] bg-[#8f3f33] px-[12px] py-[8px] font-bold text-white hover:bg-[#703026] disabled:opacity-50" onClick={() => void remove()} disabled={busy}>Yes, remove shot</button>
            <button type="button" className="rounded-[5px] border border-[#bda9a3] px-[12px] py-[8px] font-bold hover:bg-white" onClick={() => setConfirmRemove(false)} disabled={busy}>Cancel</button>
          </div>
        </div>}
        {dirty && <p className={"shot-unsaved m-[12px_0_0] text-[#9a6242] text-[11px]"} role="status">Unsaved changes</p>}
      </form>
    </article>
  );
}

function ShotPreviewCard({ shot, number }: { shot: Shot; number: number }) {
  const image = shot.image;
  const previewPath = image?.previewUrl ?? image?.previousPreviewUrl;
  const processing = image?.status === 'queued' || image?.status === 'processing';

  return (
    <article className={"board-shot min-w-0 overflow-hidden [border:1px_solid_#e7e1da] rounded-[12px] bg-[#fff] shadow-[0_12px_28px_-20px_rgba(48,_35,_24,_.22)] [transition:transform_.3s_cubic-bezier(.2,_.8,_.2,_1),_box-shadow_.3s_cubic-bezier(.2,_.8,_.2,_1)] [&:hover]:[transform:translateY(-3px)] [&:hover]:shadow-[0_21px_36px_-24px_rgba(48,_35,_24,_.28)]"} aria-label={`Shot ${number}: ${shot.shotType || 'Untitled shot'}`}>
      <div className={"board-shot-frame relative grid place-items-center aspect-video overflow-hidden bg-[#f1ede6] [&_img]:block [&_img]:w-full [&_img]:h-full [&_img]:object-contain"}>
        {previewPath
          ? <img src={imageUrl(previewPath)} alt={`Reference for shot ${number}`} />
          : <div className={"board-shot-placeholder grid place-items-center w-full h-full text-[#736b62] [font-family:Georgia,_'Times_New_Roman',_serif] text-[16px] italic"}><span>No image yet</span></div>}
        <span className={"board-shot-number absolute [left:16px] [bottom:14px] grid place-items-center min-w-[39px] h-[32px] p-[0_7px] rounded-[5px] text-[#fff] bg-ink text-[13px] font-bold tabular-nums"}>{String(number).padStart(2, '0')}</span>
      </div>
      <div className={"board-shot-body p-[23px_25px_25px]"}>
        <div className={"board-shot-heading flex items-start justify-between gap-[15px] [&_h3]:m-0 [&_h3]:[overflow-wrap:anywhere] [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[23px] [&_h3]:font-normal [&_h3]:leading-[1.25]"}><h3>{shot.shotType || 'Untitled shot'}</h3><span className={tw(`shot-status ${shot.status}`)}>{shot.status}</span></div>
        <p className={"board-shot-description m-[13px_0_0] [overflow-wrap:anywhere] whitespace-pre-wrap text-[#514b45] text-[13px] leading-[1.6]"}>{shot.description || 'No description added yet.'}</p>
        {shot.notes && <div className={"board-shot-notes [&_p]:m-[13px_0_0] [&_p]:[overflow-wrap:anywhere] [&_p]:whitespace-pre-wrap [&_p]:text-[#514b45] [&_p]:text-[13px] [&_p]:leading-[1.6] mt-[21px] pt-[16px] [border-top:1px_solid_#eee9e3] [&_span]:text-subtle [&_span]:text-[11px] [&_span]:font-bold [&_span]:uppercase [&_span]:tracking-[.05em] [&_p]:mt-[7px]"}><span>Notes</span><p>{shot.notes}</p></div>}
        {shot.prompt && <div className={"board-shot-notes [&_p]:m-[13px_0_0] [&_p]:[overflow-wrap:anywhere] [&_p]:whitespace-pre-wrap [&_p]:text-[#514b45] [&_p]:text-[13px] [&_p]:leading-[1.6] mt-[21px] pt-[16px] [border-top:1px_solid_#eee9e3] [&_span]:text-subtle [&_span]:text-[11px] [&_span]:font-bold [&_span]:uppercase [&_span]:tracking-[.05em] [&_p]:mt-[7px]"}><span>Visual prompt</span><p>{shot.prompt}</p></div>}
        {processing && <p className={"board-shot-image-state m-[17px_0_0] text-muted text-[12px] leading-[1.5] [&.failed]:text-[#9a3e32]"} role="status">Image processing…</p>}
        {image?.status === 'failed' && <p className={"board-shot-image-state m-[17px_0_0] text-muted text-[12px] leading-[1.5] [&.failed]:text-[#9a3e32] failed"}>Image unavailable: {image.error ?? 'Processing failed.'}{previewPath ? ' Showing the previous image.' : ''}</p>}
      </div>
    </article>
  );
}

export function Shots({ sceneId, onDirtyChange }: { sceneId: string; onDirtyChange?: (dirty: boolean) => void }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState<'flow' | 'board' | 'edit'>('flow');
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [inspectorDirty, setInspectorDirty] = useState(false);
  const [listDirtyIds, setListDirtyIds] = useState<Set<string>>(() => new Set());
  const anyDirty = inspectorDirty || listDirtyIds.size > 0;

  useEffect(() => {
    setSelectedShotId(null);
    setInspectorDirty(false);
    setListDirtyIds(new Set());
  }, [sceneId]);

  function markListDirty(id: string, dirty: boolean) {
    setListDirtyIds((previous) => {
      if (previous.has(id) === dirty) return previous;
      const next = new Set(previous);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  useEffect(() => { onDirtyChange?.(anyDirty); }, [anyDirty, onDirtyChange]);

  useEffect(() => {
    if (!anyDirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [anyDirty]);

  const selectedIndex = Math.max(0, shots.findIndex((shot) => shot.id === selectedShotId));
  const selectedShot = shots[selectedIndex];

  function selectShot(id: string) {
    if (selectedShot?.id === id) return;
    if (inspectorDirty && !window.confirm('Discard unsaved changes to this shot?')) return;
    setInspectorDirty(false);
    setSelectedShotId(id);
    if (viewMode !== 'flow') setViewMode('flow');
  }

  function switchView(mode: 'flow' | 'board' | 'edit') {
    if (mode === viewMode) return;
    if (anyDirty && !window.confirm('Discard unsaved shot changes?')) return;
    setInspectorDirty(false);
    setListDirtyIds(new Set());
    setViewMode(mode);
  }

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
    if (anyDirty && !window.confirm('Discard unsaved shot changes?')) return;
    setBusy(true);
    setError(null);
    try {
      const created = await shotApi.create(sceneId);
      setShots((previous) => [...previous, created]);
      setInspectorDirty(false);
      setListDirtyIds(new Set());
      setSelectedShotId(created.id);
      setViewMode('flow');
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

  async function reorder(ids: string[]) {
    setBusy(true);
    try { setShots(await shotApi.reorder(sceneId, ids)); }
    finally { setBusy(false); }
  }

  function editShot(id: string) {
    selectShot(id);
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await shotApi.remove(id);
      setShots((previous) => previous.filter((shot) => shot.id !== id));
      setListDirtyIds((previous) => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
      if (selectedShot?.id === id) setInspectorDirty(false);
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
    <section className={"shots-section mt-[76px] max-[520px]:mt-[60px]"} aria-labelledby="shots-heading">
      <div className={"shots-heading flex items-end justify-between gap-[24px] mb-[27px] [&_.editor-context]:mb-[10px] [&_h2]:flex [&_h2]:items-center [&_h2]:gap-[12px] [&_h2]:m-0 [&_h2]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h2]:text-[clamp(31px,_3.5vw,_43px)] [&_h2]:font-normal [&_h2]:tracking-[-.025em] [&_p:last-child]:m-[10px_0_0] [&_p:last-child]:text-subtle [&_p:last-child]:text-[14px] [&_p:last-child]:leading-[1.5] max-[520px]:items-start max-[520px]:flex-col"}>
        <div><p className={"editor-context m-[0_0_13px] text-rust text-[12px] font-bold tracking-[.03em]"}>Build the sequence</p><h2 id="shots-heading">Shots <span className={"shot-count grid place-items-center min-w-[29px] h-[29px] p-[0_7px] rounded-[50%] text-[#6d6158] bg-[#eae5dd] [font-family:-apple-system,_BlinkMacSystemFont,_'Segoe_UI',_sans-serif] text-[12px] font-bold tabular-nums"}>{shots.length}</span></h2><p>{viewMode === 'flow' ? 'Explore the sequence. Select a frame to shape its details.' : viewMode === 'board' ? 'Your scene, frame by frame.' : 'Edit each shot in sequence.'}</p></div>
        <div className={"shots-heading-actions flex flex-wrap justify-end gap-[9px] max-[520px]:justify-start"}>
          {shots.length > 0 && <div className={"shot-view-switch inline-flex items-center gap-[3px] p-[3px] [border:1px_solid_#dfd7cc] rounded-[8px] bg-[#eee9e1] [&_button]:min-h-[35px] [&_button]:p-[7px_12px] [&_button]:border-0 [&_button]:rounded-[5px] [&_button]:text-[#5e584f] [&_button]:bg-transparent [&_button]:text-[12px] [&_button]:font-bold [&_button]:[transition:background_.2s_ease,_color_.2s_ease,_box-shadow_.2s_ease] [&_button:hover]:text-ink [&_button:hover]:bg-[#f7f4ee] [&_button[aria-pressed=true]]:text-ink [&_button[aria-pressed=true]]:bg-[#fff] [&_button[aria-pressed=true]]:shadow-[0_2px_8px_rgba(48,_35,_24,_.09)] max-[520px]:w-full max-[520px]:[&_button]:flex-1"} role="group" aria-label="Shot view">
            <button type="button" onClick={() => switchView('flow')} aria-pressed={viewMode === 'flow'}>Canvas</button>
            <button type="button" onClick={() => switchView('board')} aria-pressed={viewMode === 'board'}>Board</button>
            <button type="button" onClick={() => switchView('edit')} aria-pressed={viewMode === 'edit'}>List</button>
          </div>}
          <button type="button" className={"primary-button inline-flex items-center justify-center gap-[13px] min-h-[43px] p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-[#fff] bg-ink text-[12px] font-bold whitespace-nowrap transition-[background,transform] duration-[180ms] [&:hover:not(:disabled)]:bg-[#3f5849] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&:disabled]:opacity-[.5] [&_svg]:w-[17px] [&_svg]:h-[17px] max-[520px]:[align-self:flex-start]"} onClick={() => void create()} disabled={busy || loading}>Add shot</button>
        </div>
      </div>
      {loading && <div className={"shot-empty p-[52px_24px] [border:1px_dashed_#d7cfc5] rounded-[12px] text-subtle bg-cream text-center text-[14px] [&_h3]:m-[13px_0_6px] [&_h3]:text-[#39342f] [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[24px] [&_h3]:font-normal [&_p]:m-[0_0_20px] [&_p]:leading-[1.5]"} role="status">Loading shots…</div>}
      {error && <div className={"notice mt-[23px] p-[12px_14px] rounded-[6px] text-[12px] leading-[1.5] [&.error]:text-[#7d2e24] [&.error]:bg-[#f9eae7] error shot-list-error m-[0_0_20px] [&_.text-button]:ml-[5px] [&_.text-button]:text-[#7d2e24]"} role="alert">{error} <button type="button" className={"text-button p-0 border-0 [background:none] text-[#eed0bc] text-[12px] underline [text-underline-offset:3px]"} onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>}
      {!loading && !error && shots.length === 0 && <div className={"shot-empty p-[52px_24px] [border:1px_dashed_#d7cfc5] rounded-[12px] text-subtle bg-cream text-center text-[14px] [&_h3]:m-[13px_0_6px] [&_h3]:text-[#39342f] [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[24px] [&_h3]:font-normal [&_p]:m-[0_0_20px] [&_p]:leading-[1.5]"}><div className={"empty-frame grid place-items-center w-[54px] h-[54px] m-[0_auto] [border:1px_solid_#dbcfc2] rounded-[6px] text-[#ad6949] bg-[#f8f3ec] [font-family:Georgia,_'Times_New_Roman',_serif] text-[22px]"} aria-hidden="true">01</div><h3>Your first frame starts here.</h3><p>Add a shot to describe what the camera sees.</p><button type="button" className={"secondary-button p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]"} onClick={() => void create()} disabled={busy}>Add your first shot</button></div>}
      {!loading && shots.length > 0 && viewMode === 'edit' && <div className={"shot-list grid gap-[20px] [&[hidden]]:hidden"}>{shots.map((shot, index) => <ShotCard key={shot.id} shot={shot} number={index + 1} first={index === 0} last={index === shots.length - 1} busy={busy} onSave={(changes) => update(shot.id, changes)} onMove={(direction) => move(index, direction)} onRemove={() => remove(shot.id)} onUploadImage={(file) => uploadImage(shot.id, file)} onRetryImage={() => retryImage(shot.id)} onGeneratePrompt={() => generatePrompt(shot.id)} onDirtyChange={(dirty) => markListDirty(shot.id, dirty)} />)}</div>}
      {!loading && shots.length > 0 && viewMode === 'board' && <div className={"shot-board grid [grid-template-columns:repeat(2,_minmax(0,_1fr))] [align-items:start] gap-[22px] max-[760px]:[grid-template-columns:1fr]"}>{shots.map((shot, index) => <ShotPreviewCard key={shot.id} shot={shot} number={index + 1} />)}</div>}
      {!loading && shots.length > 0 && viewMode === 'flow' && <div className={"shot-workspace grid [grid-template-columns:minmax(0,_1fr)_minmax(340px,_390px)] [align-items:start] gap-[18px] min-w-0 [&_.flow-view]:min-w-0 [&_.flow-view]:rounded-[14px] [&_.flow-view]:bg-[#eee9e1] [&_.flow-view-top]:items-start [&_.flow-view-top]:p-[19px_21px_17px] [&_.flow-view-top_h3]:text-[22px] [&_.flow-view-top_>_span]:mt-[7px] [&_.flow-view-top_>_span]:whitespace-nowrap [&_.flow-canvas]:h-[min(69vh,_650px)] [&_.flow-canvas]:min-h-[480px] [&_.flow-canvas]:bg-[#f8f5ef] [&_.flow-panel]:m-[15px] [&_.flow-panel]:p-[8px_11px] [&_.flow-panel]:rounded-[6px] [&_.flow-panel]:text-[#4a554c] [&_.flow-panel]:[background:rgba(255,_255,_255,_.94)] [&_.flow-panel]:shadow-[0_7px_20px_-12px_rgba(43,_42,_34,_.35)] [&_.flow-panel]:text-[11px] [&_.flow-panel]:font-bold [&_.react-flow__node-shot.selected_.flow-shot]:shadow-[0_0_0_3px_#a3573c,_0_18px_34px_-20px_rgba(41,_37,_30,_.48)] [&_.react-flow__node-shot.selected_.flow-shot-number]:bg-rust [&_.react-flow__minimap]:w-[130px] [&_.react-flow__minimap]:h-[78px] [&_.react-flow__minimap]:m-[14px] [&_.react-flow__minimap]:[border:1px_solid_#ddd3c7] [&_.react-flow__minimap]:rounded-[7px] [&_.react-flow__minimap]:bg-[#fff] max-[1080px]:[grid-template-columns:minmax(0,_1fr)] max-[1080px]:[&_.flow-canvas]:h-[460px] max-[1080px]:[&_.flow-canvas]:min-h-[0] max-[600px]:gap-[13px] max-[600px]:[&_.flow-view-top]:p-[17px_18px_13px] max-[600px]:[&_.flow-view-top_>_span]:mt-[0] max-[600px]:[&_.flow-canvas]:h-[380px] max-[600px]:[&_.flow-panel]:hidden"}>
        <Suspense fallback={<div className={"shot-empty p-[52px_24px] [border:1px_dashed_#d7cfc5] rounded-[12px] text-subtle bg-cream text-center text-[14px] [&_h3]:m-[13px_0_6px] [&_h3]:text-[#39342f] [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[24px] [&_h3]:font-normal [&_p]:m-[0_0_20px] [&_p]:leading-[1.5]"} role="status">Opening canvas…</div>}><ShotFlow shots={shots} busy={busy} selectedShotId={selectedShot?.id ?? null} onReorder={reorder} onEdit={editShot} /></Suspense>
        {selectedShot && <aside className={"shot-inspector min-w-0 rounded-[14px] sticky [top:16px] max-h-[min(78vh,_770px)] overflow-auto [border:1px_solid_#e3ddd4] bg-[#fff] [scrollbar-color:#c6b9aa_transparent] [&_.shot-card]:p-[24px_22px_28px] [&_.shot-card]:border-0 [&_.shot-card]:rounded-[0] [&_.shot-card]:shadow-[none] [&_.shot-card-header]:pb-[18px] [&_.shot-card-title]:gap-[10px] [&_.shot-number]:w-[41px] [&_.shot-number]:h-[41px] [&_.shot-number]:text-[19px] [&_.shot-card_h3]:text-[19px] [&_.shot-media]:[grid-template-columns:minmax(0,_1fr)] [&_.shot-media]:gap-[15px] [&_.shot-media]:pt-[18px] [&_.shot-fields]:gap-[18px] [&_.shot-fields]:pt-[22px] [&_.shot-prompt]:p-[17px] [&_.shot-prompt-heading]:items-start [&_.shot-prompt-heading]:flex-col [&_.shot-actions]:items-start [&_.shot-actions]:flex-col [&_.shot-main-actions]:justify-start max-[1080px]:static max-[1080px]:max-h-[none] max-[1080px]:overflow-visible max-[1080px]:[&_.shot-media]:[grid-template-columns:minmax(0,_1.2fr)_minmax(210px,_.8fr)] max-[600px]:[&_.shot-media]:[grid-template-columns:minmax(0,_1fr)]"} aria-label={`Edit shot ${selectedIndex + 1}`}>
          <div className={"shot-inspector-heading flex items-center justify-between gap-[12px] p-[17px_22px] [border-bottom:1px_solid_#eee9e3] bg-cream [&_span:first-child]:text-[#9b563c] [&_span:first-child]:text-[11px] [&_span:first-child]:font-bold [&_p]:m-[4px_0_0] [&_p]:text-ink [&_p]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_p]:text-[20px]"}><div><span>Selected frame</span><p>Shot {String(selectedIndex + 1).padStart(2, '0')} of {String(shots.length).padStart(2, '0')}</p></div></div>
          <ShotCard key={selectedShot.id} shot={selectedShot} number={selectedIndex + 1} first={selectedIndex === 0} last={selectedIndex === shots.length - 1} busy={busy} onSave={(changes) => update(selectedShot.id, changes)} onMove={(direction) => move(selectedIndex, direction)} onRemove={() => remove(selectedShot.id)} onUploadImage={(file) => uploadImage(selectedShot.id, file)} onRetryImage={() => retryImage(selectedShot.id)} onGeneratePrompt={() => generatePrompt(selectedShot.id)} onDirtyChange={setInspectorDirty} />
        </aside>}
      </div>}
      {!loading && !error && shots.length > 0 && <div className={"shots-export flex items-center justify-between gap-[24px] mb-[24px] p-[18px_21px] [border:1px_solid_#e7e1da] rounded-[8px] bg-cream [&_h3]:m-0 [&_h3]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h3]:text-[18px] [&_h3]:font-normal [&_p]:m-[5px_0_0] [&_p]:text-subtle [&_p]:text-[12px] [&_p]:leading-[1.5] max-[760px]:items-start max-[760px]:flex-col"}><div><h3>Export this scene</h3><p>Downloads use saved shots. The PDF includes approved prompts.</p></div><div className={"shots-export-actions flex flex-wrap justify-end gap-[8px] [&_.secondary-button]:inline-flex [&_.secondary-button]:items-center [&_.secondary-button]:whitespace-nowrap [&_.secondary-button]:no-underline max-[760px]:justify-start"}><a className={"secondary-button p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]"} href={sceneApi.exportUrl(sceneId, 'pdf')}>PDF storyboard</a><a className={"secondary-button p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]"} href={sceneApi.exportUrl(sceneId, 'txt')}>Prompts .txt</a><a className={"secondary-button p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]"} href={sceneApi.exportUrl(sceneId, 'json')}>Storyboard .json</a></div></div>}
    </section>
  );
}
