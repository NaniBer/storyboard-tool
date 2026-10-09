import { tw } from './tailwind-classes';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { sceneApi, type Scene } from './api';
import { Shots } from './Shots';

const SceneFlow = lazy(() => import('./SceneFlow'));

function currentSceneId(): string | null {
  return new URLSearchParams(window.location.search).get('scene');
}

function setSceneInUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('scene', id);
  else url.searchParams.delete('scene');
  window.history.pushState({}, '', url);
}

function sortScenes(scenes: Scene[]) {
  return [...scenes].sort((a, b) => a.position - b.position);
}

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function FrameIcon() {
  return <svg viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="30" height="28" rx="2" /><path d="M3 12h30M12 4v8m12-8v8" /></svg>;
}

type SceneFormProps = {
  scene?: Scene;
  busy: boolean;
  error: string | null;
  onSubmit: (title: string, description: string) => Promise<void>;
  onRemove?: () => Promise<void>;
};

function SceneForm({ scene, busy, error, onSubmit, onRemove }: SceneFormProps) {
  const [title, setTitle] = useState(scene?.title ?? '');
  const [description, setDescription] = useState(scene?.description ?? '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const dirty = scene ? title !== scene.title || description !== scene.description : Boolean(title.trim() || description.trim());

  useEffect(() => {
    if (scene) {
      setTitle(scene.title);
      setDescription(scene.description);
    }
  }, [scene?.updatedAt]);

  async function remove() {
    if (!onRemove || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await onRemove();
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : 'Could not remove this scene. Please try again.');
      setRemoving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || busy || (scene && !dirty)) return;
    void onSubmit(title.trim(), description.trim());
  }

  return (
    <form className={"scene-form max-w-[720px]"} onSubmit={submit}>
      <div className={"field [&_+_.field]:mt-[30px] [&_label]:block [&_label]:mb-[11px] [&_label]:text-[#39342f] [&_label]:text-[13px] [&_label]:font-bold [&_input]:block [&_input]:w-full [&_input]:p-[14px_15px] [&_input]:[border:1px_solid_#d4cec6] [&_input]:rounded-[6px] [&_input]:[outline:none] [&_input]:text-[#2b2926] [&_input]:bg-[#fff] [&_input]:text-[14px] [&_input]:leading-[1.5] [&_input]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_textarea]:block [&_textarea]:w-full [&_textarea]:p-[14px_15px] [&_textarea]:[border:1px_solid_#d4cec6] [&_textarea]:rounded-[6px] [&_textarea]:[outline:none] [&_textarea]:text-[#2b2926] [&_textarea]:bg-[#fff] [&_textarea]:text-[14px] [&_textarea]:leading-[1.5] [&_textarea]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_input::placeholder]:text-[#78736c] [&_textarea::placeholder]:text-[#78736c] [&_input:hover]:[border-color:#9f968d] [&_textarea:hover]:[border-color:#9f968d] [&_input:focus]:[border-color:#a65a3e] [&_input:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_textarea:focus]:[border-color:#a65a3e] [&_textarea:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_input:disabled]:opacity-[.68] [&_textarea:disabled]:opacity-[.68] [&_textarea]:min-h-[145px] [&_textarea]:[resize:vertical]"}>
        <label htmlFor="scene-title">Scene title <span className={"required text-[#ab5738]"} aria-hidden="true">*</span></label>
        <input
          id="scene-title"
          autoFocus={!scene}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="The letter outside the café"
          maxLength={120}
          required
          disabled={busy}
        />
        <p className={"field-hint m-[9px_0_0] text-subtle text-[11px]"}>Give this moment a name you’ll recognize later.</p>
      </div>
      <div className={"field [&_+_.field]:mt-[30px] [&_label]:block [&_label]:mb-[11px] [&_label]:text-[#39342f] [&_label]:text-[13px] [&_label]:font-bold [&_input]:block [&_input]:w-full [&_input]:p-[14px_15px] [&_input]:[border:1px_solid_#d4cec6] [&_input]:rounded-[6px] [&_input]:[outline:none] [&_input]:text-[#2b2926] [&_input]:bg-[#fff] [&_input]:text-[14px] [&_input]:leading-[1.5] [&_input]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_textarea]:block [&_textarea]:w-full [&_textarea]:p-[14px_15px] [&_textarea]:[border:1px_solid_#d4cec6] [&_textarea]:rounded-[6px] [&_textarea]:[outline:none] [&_textarea]:text-[#2b2926] [&_textarea]:bg-[#fff] [&_textarea]:text-[14px] [&_textarea]:leading-[1.5] [&_textarea]:[transition:border-color_.18s_ease,_box-shadow_.18s_ease] [&_input::placeholder]:text-[#78736c] [&_textarea::placeholder]:text-[#78736c] [&_input:hover]:[border-color:#9f968d] [&_textarea:hover]:[border-color:#9f968d] [&_input:focus]:[border-color:#a65a3e] [&_input:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_textarea:focus]:[border-color:#a65a3e] [&_textarea:focus]:shadow-[0_0_0_3px_rgba(166,_90,_62,_.14)] [&_input:disabled]:opacity-[.68] [&_textarea:disabled]:opacity-[.68] [&_textarea]:min-h-[145px] [&_textarea]:[resize:vertical]"}>
        <label htmlFor="scene-description">Description <span className={"optional ml-[5px] text-[#7f7a73] text-[11px] font-normal"}>Optional</span></label>
        <textarea
          id="scene-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What happens in this scene? Set the mood, location, or action."
          rows={5}
          maxLength={2000}
          disabled={busy}
        />
      </div>
      {error && <div className={"notice mt-[23px] p-[12px_14px] rounded-[6px] text-[12px] leading-[1.5] [&.error]:text-[#7d2e24] [&.error]:bg-[#f9eae7] error"} role="alert">{error}</div>}
      {scene && onRemove && (
        <div className={"remove-scene mt-[23px] rounded-[6px] p-[15px] text-[12px] bg-[#f9eae7] [&_p]:m-0 [&_p]:text-[#6f3028] [&_p]:leading-[1.5] [&_button]:font-bold"} aria-label={`Remove scene ${scene.title}`}>
          {confirmRemove ? (
            <div className="flex items-center justify-between gap-[14px] max-[520px]:flex-col max-[520px]:items-stretch">
              <p><strong>Remove “{scene.title}”</strong> and its {scene.shotCount === 1 ? 'shot' : `${scene.shotCount} shots`}? This can’t be undone.</p>
              <span className="flex gap-[9px] flex-none max-[520px]:justify-end">
                <button className={"rounded-[5px] bg-[#8f3f33] p-[8px_12px] text-white [transition:background_.18s_ease] [&:hover]:bg-[#703026] [&:disabled]:opacity-50"} type="button" onClick={() => void remove()} disabled={removing}>{removing ? 'Removing…' : 'Yes, remove scene'}</button>
                <button className={"rounded-[5px] border-0 p-[8px_12px] bg-transparent text-[#6f3028] underline [text-underline-offset:3px] [&:hover]:text-[#4f231d] [&:disabled]:opacity-50"} type="button" onClick={() => setConfirmRemove(false)} disabled={removing}>Cancel</button>
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-[14px] max-[520px]:flex-col max-[520px]:items-stretch">
              <p>Scenes removed here are gone for good, including every shot.</p>
              <button className={"quiet-button p-[9px_10px] border-0 rounded-[5px] bg-transparent text-[#a34d3d] text-[12px] font-semibold [transition:background_.18s_ease,_color_.18s_ease] [&:hover]:text-[#81372c] [&:hover]:bg-[#f3ded8] [&:disabled]:opacity-[.4]"} type="button" onClick={() => setConfirmRemove(true)} disabled={removing} aria-expanded={confirmRemove}>Remove scene</button>
            </div>
          )}
          {removeError && <p role="alert" className="mt-[9px]">{removeError}</p>}
        </div>
      )}
      <div className={"form-footer flex items-center justify-between gap-[20px] mt-[35px] pt-[25px] [border-top:1px_solid_#eee9e3] [&_p]:m-0 [&_p]:text-subtle [&_p]:text-[12px] [&_p]:leading-[1.5] max-[520px]:items-stretch max-[520px]:flex-col max-[520px]:gap-[16px]"}>
        <p>{scene ? (dirty ? 'Unsaved changes' : `Last saved ${formattedDate(scene.updatedAt)}`) : 'You can add shots after creating the scene.'}</p>
        <button className={"primary-button inline-flex items-center justify-center gap-[13px] min-h-[43px] p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-[#fff] bg-ink text-[12px] font-bold whitespace-nowrap transition-[background,transform] duration-[180ms] [&:hover:not(:disabled)]:bg-[#3f5849] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&:disabled]:opacity-[.5] [&_svg]:w-[17px] [&_svg]:h-[17px] max-[520px]:[align-self:flex-start]"} type="submit" disabled={busy || !title.trim() || Boolean(scene && !dirty)}>
          {busy ? 'Saving…' : scene ? 'Save changes' : 'Create scene'}
          {!busy && <ArrowIcon />}
        </button>
      </div>
    </form>
  );
}

export function App({ username, onSignOut, signingOut, signOutError }: { username: string; onSignOut: () => void; signingOut: boolean; signOutError: string | null }) {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(currentSceneId);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingScene, setCreatingScene] = useState(false);
  const [editingScene, setEditingScene] = useState(false);
  const [shotDirty, setShotDirty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError(null);
    sceneApi.list().then((result) => {
      if (active) setScenes(sortScenes(result));
    }).catch((error: unknown) => {
      if (active) setListError(error instanceof Error ? error.message : 'Could not load scenes.');
    }).finally(() => {
      if (active) setListLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    const onPopState = () => setSelectedId(currentSceneId());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedScene(null);
      setSceneError(null);
      return;
    }

    let active = true;
    setSceneLoading(true);
    setSceneError(null);
    setSaveError(null);
    setSelectedScene(null);
    sceneApi.get(selectedId).then((result) => {
      if (active) setSelectedScene(result);
    }).catch((error: unknown) => {
      if (active) setSceneError(error instanceof Error ? error.message : 'Could not open this scene.');
    }).finally(() => {
      if (active) setSceneLoading(false);
    });
    return () => { active = false; };
  }, [selectedId, reloadKey]);

  function selectScene(id: string | null): boolean {
    if (saving) return false;
    if (id !== selectedId && shotDirty && !window.confirm('Discard unsaved changes to this shot?')) return false;
    if (id === selectedId && !creatingScene && !editingScene) return true;
    if (selectedId && !id) setReloadKey((value) => value + 1);
    setSceneInUrl(id);
    setSelectedId(id);
    setCreatingScene(false);
    setEditingScene(false);
    setShotDirty(false);
    setSaveError(null);
    return true;
  }

  function startScene() {
    if (saving) return;
    if (!selectScene(null)) return;
    setCreatingScene(true);
  }

  async function reorderScenes(ids: string[]) {
    setSaving(true);
    setListError(null);
    try {
      setScenes(sortScenes(await sceneApi.reorder(ids)));
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Could not save the scene order.');
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function createScene(title: string, description: string) {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await sceneApi.create(title, description);
      setScenes((previous) => sortScenes([created, ...previous]));
      setListError(null);
      setListLoading(false);
      setSceneInUrl(created.id);
      setSelectedId(created.id);
      setCreatingScene(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not create scene. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function updateScene(title: string, description: string) {
    if (!selectedScene) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await sceneApi.update(selectedScene.id, title, description);
      setSelectedScene((previous) => previous?.id === updated.id ? updated : previous);
      setScenes((previous) => sortScenes(previous.map((scene) => scene.id === updated.id ? updated : scene)));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save scene. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function removeScene() {
    if (!selectedScene) return;
    setSaving(true);
    try {
      await sceneApi.remove(selectedScene.id);
      setScenes((previous) => sortScenes(previous.filter((scene) => scene.id !== selectedScene.id)));
      setEditingScene(false);
      setSaveError(null);
      setListError(null);
      selectScene(null);
      setReloadKey((value) => value + 1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={"app-shell grid [grid-template-columns:280px_minmax(0,_1fr)] min-h-[100vh] max-[760px]:block"}>
      <aside className={"sidebar flex flex-col min-h-[100vh] p-[27px_18px_20px] text-soft-line bg-[#252927] max-[760px]:min-h-[auto] max-[760px]:p-[15px_16px_12px] max-[760px]:relative"} aria-label="Scenes">
        <button className={"brand flex items-center gap-[11px] p-[1px_12px] [font-family:Georgia,_'Times_New_Roman',_serif] text-[21px] font-bold tracking-[-.02em] max-[760px]:p-0 max-[760px]:text-[20px] brand-button w-full border-0 text-inherit bg-transparent text-left [&:hover]:text-[#fff]"} type="button" onClick={() => selectScene(null)} aria-label="Storyboard overview"><span className={"brand-mark w-[32px] h-[32px] flex items-center justify-center text-[#d6ae94] [&_svg]:w-[30px] [&_svg]:h-[30px]"}><FrameIcon /></span><span>Storyboard<span className={"brand-dot text-[#d99975]"}>.</span></span></button>
        <div className={"sidebar-heading flex items-center gap-[9px] m-[63px_12px_15px] [&_h2]:m-0 [&_h2]:text-[12px] [&_h2]:font-bold [&_h2]:tracking-[.09em] [&_h2]:uppercase max-[760px]:m-[26px_0_12px] max-[760px]:hidden"}><h2>Scenes</h2><span className={"scene-count grid place-items-center min-w-[22px] h-[22px] p-[0_5px] rounded-[20px] text-[#dad6d0] bg-[#3e4340] text-[11px] tabular-nums"}>{scenes.length}</span></div>
        <button className={"new-scene-button flex items-center gap-[9px] w-full p-[11px_13px] [border:1px_solid_#777d77] rounded-[7px] bg-transparent text-[#f4eee7] text-left text-[13px] font-semibold [transition:background_.18s_ease,_border-color_.18s_ease] [&:hover]:bg-[#343a36] [&:hover]:[border-color:#b8beb6] [&_svg]:w-[17px] [&_svg]:h-[17px] max-[760px]:max-w-[190px] max-[760px]:mt-[14px]"} onClick={startScene} type="button" disabled={saving}><PlusIcon /> New scene</button>
        <button className={tw(`overview-link${!selectedId && !creatingScene ? ' selected' : ''}`)} type="button" onClick={() => selectScene(null)} disabled={saving}>Storyboard overview <ArrowIcon /></button>
        <nav className={"scene-nav flex flex-col gap-[3px] mt-[8px] max-[760px]:flex-row max-[760px]:overflow-x-auto max-[760px]:m-[14px_-16px_0] max-[760px]:p-[0_16px_4px] max-[760px]:[scrollbar-color:#777d77_transparent] max-[760px]:mt-[10px]"} aria-label="Scene list">
          {listLoading && <p className={"sidebar-message p-[12px_13px] text-[#bfc5be] text-[12px] leading-[1.5] [&_p]:m-[0_0_8px] max-[760px]:pl-[0]"} role="status">Loading scenes…</p>}
          {listError && <div className={"sidebar-message p-[12px_13px] text-[#bfc5be] text-[12px] leading-[1.5] [&_p]:m-[0_0_8px] max-[760px]:pl-[0]"}><p role="alert">{listError}</p><button className={"text-button p-0 border-0 [background:none] text-[#eed0bc] text-[12px] underline [text-underline-offset:3px]"} type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>}
          {!listLoading && !listError && scenes.length === 0 && <p className={"sidebar-message p-[12px_13px] text-[#bfc5be] text-[12px] leading-[1.5] [&_p]:m-[0_0_8px] max-[760px]:pl-[0]"}>Your scenes will appear here.</p>}
          {!listLoading && !listError && scenes.map((scene) => (
            <button
              key={scene.id}
              className={tw(`scene-link${scene.id === selectedId ? ' selected' : ''}`)}
              type="button"
              onClick={() => selectScene(scene.id)}
              disabled={saving}
              aria-current={scene.id === selectedId ? 'page' : undefined}
            >
              <span className={"scene-link-title overflow-hidden [text-overflow:ellipsis] whitespace-nowrap text-[13px] font-semibold"}>{scene.title}</span>
              <span className={"scene-link-date text-[#bfc5be] text-[11px] tabular-nums"}>Scene {scene.position + 1} · {scene.shotCount} {scene.shotCount === 1 ? 'shot' : 'shots'}</span>
            </button>
          ))}
        </nav>
        <div className={"sidebar-foot mt-[auto] p-[22px_12px_0] text-[#bdc2ba] [font-family:Georgia,_'Times_New_Roman',_serif] text-[13px] italic [&_span]:block [&_span]:mb-[11px] [&_span]:[overflow-wrap:anywhere] [&_p]:[font-family:-apple-system,_BlinkMacSystemFont,_'Segoe_UI',_sans-serif] [&_p]:text-[12px] [&_p]:not-italic [&_p]:leading-[1.5] max-[760px]:absolute max-[760px]:[top:19px] max-[760px]:[right:16px] max-[760px]:m-0 max-[760px]:p-0 max-[760px]:[&_span]:hidden"}><span>Signed in as {username}</span><button className={"sidebar-signout p-0 border-0 text-[#eed0bc] [background:none] [font-family:-apple-system,_BlinkMacSystemFont,_'Segoe_UI',_sans-serif] text-[12px] not-italic underline [text-underline-offset:3px] [&:hover]:text-[#fff] [&:disabled]:opacity-[.5]"} type="button" onClick={onSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>{signOutError && <p role="alert">{signOutError}</p>}</div>
      </aside>

      <main className={"main-area min-w-0"}>
        <div className={"topbar flex items-center gap-[12px] h-[73px] p-[0_clamp(28px,_5vw,_80px)] [border-bottom:1px_solid_#e8e3dc] text-[#77736c] bg-cream text-[12px] font-semibold [&_span:last-child]:text-[#34302c] max-[760px]:h-[58px] max-[760px]:p-[0_24px]"}><button className={"breadcrumb-button p-[6px_0] border-0 text-[#6b665f] bg-transparent text-[inherit] [font-weight:inherit] [&:hover]:text-ink [&:hover]:underline [&:hover]:[text-underline-offset:3px]"} type="button" onClick={() => selectScene(null)}>Storyboard</button>{selectedScene && <><span className={"topbar-rule w-[17px] h-[1px] bg-[#b4ada3]"} /><span>{selectedScene.title}</span></>}</div>
        <div className={"content-area max-w-[none] m-[0_auto] p-[33px_clamp(24px,_3vw,_54px)_68px] max-[760px]:p-[27px_20px_70px]"}>
          {selectedId && sceneLoading && <div className={"center-state [&_h1]:m-0 [&_h1]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h1]:text-[clamp(38px,_4.5vw,_57px)] [&_h1]:font-normal [&_h1]:tracking-[-.025em] [&_h1]:leading-[1.12] [&_h1]:[overflow-wrap:anywhere] p-[80px_0] text-subtle text-[14px] [&_h1]:text-[#272523] [&_p]:m-[18px_0_24px] [&_p]:leading-[1.5]"} role="status">Opening scene…</div>}
          {selectedId && !sceneLoading && sceneError && <div className={"center-state [&_h1]:m-0 [&_h1]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h1]:text-[clamp(38px,_4.5vw,_57px)] [&_h1]:font-normal [&_h1]:tracking-[-.025em] [&_h1]:leading-[1.12] [&_h1]:[overflow-wrap:anywhere] p-[80px_0] text-subtle text-[14px] [&_h1]:text-[#272523] [&_p]:m-[18px_0_24px] [&_p]:leading-[1.5]"}><h1>Couldn’t open this scene</h1><p role="alert">{sceneError}</p><button className={"secondary-button p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]"} type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>}
          {selectedId && !sceneLoading && selectedScene && (
            <section className={"editor scene-workspace [&_.shots-section]:mt-[20px]"} aria-labelledby="editor-heading">
              <div className={"workspace-heading flex items-end justify-between gap-[24px] mb-[22px] [&_h1]:m-0 [&_h1]:text-ink [&_h1]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h1]:text-[clamp(34px,_3vw,_48px)] [&_h1]:font-normal [&_h1]:tracking-[-.025em] [&_h1]:leading-[1.15] [&_h1]:[overflow-wrap:anywhere] [&_p]:max-w-[66ch] [&_p]:m-[10px_0_0] [&_p]:text-muted [&_p]:text-[13px] [&_p]:leading-[1.55] [&_.primary-button]:flex-none [&_.secondary-button]:flex-none max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-[17px] max-[760px]:[&_h1]:text-[35px]"}><div><button className={"workspace-back inline-flex m-[0_0_15px] p-[3px_0] border-0 text-[#925036] bg-transparent text-[12px] font-bold [&:hover]:text-[#603a28] [&:hover]:underline [&:hover]:[text-underline-offset:3px]"} type="button" onClick={() => selectScene(null)}>← All scenes</button><h1 id="editor-heading">{selectedScene.title}</h1><p>{selectedScene.description || 'Build the sequence for this scene.'}</p></div><button className={"secondary-button p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-ink bg-transparent text-[12px] font-bold [&:hover]:bg-[#ecf0eb]"} type="button" onClick={() => setEditingScene((value) => !value)} aria-expanded={editingScene} aria-controls="scene-details-panel">{editingScene ? 'Close scene details' : 'Edit scene details'}</button></div>
              {editingScene && <div className={"editor-panel p-[clamp(28px,_4.8vw,_55px)] bg-[#fff] [border:1px_solid_#e7e1da] rounded-[12px] shadow-[0_12px_28px_-20px_rgba(48,_35,_24,_.27)] max-[520px]:p-[24px_20px] scene-details-panel max-w-[860px] mb-[25px]"} id="scene-details-panel"><SceneForm key={selectedScene.id} scene={selectedScene} busy={saving} error={saveError} onSubmit={updateScene} onRemove={removeScene} /></div>}
              <Shots key={selectedScene.id} sceneId={selectedScene.id} onDirtyChange={setShotDirty} />
            </section>
          )}
          {!selectedId && !creatingScene && (
            <section className={"storyboard-workspace"} aria-labelledby="overview-heading">
              <div className={"workspace-heading flex items-end justify-between gap-[24px] mb-[22px] [&_h1]:m-0 [&_h1]:text-ink [&_h1]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h1]:text-[clamp(34px,_3vw,_48px)] [&_h1]:font-normal [&_h1]:tracking-[-.025em] [&_h1]:leading-[1.15] [&_h1]:[overflow-wrap:anywhere] [&_p]:max-w-[66ch] [&_p]:m-[10px_0_0] [&_p]:text-muted [&_p]:text-[13px] [&_p]:leading-[1.55] [&_.primary-button]:flex-none [&_.secondary-button]:flex-none max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-[17px] max-[760px]:[&_h1]:text-[35px]"}><div><h1 id="overview-heading">Your storyboard</h1><p>Map the scenes, then open one to build its shots.</p></div><button className={"primary-button inline-flex items-center justify-center gap-[13px] min-h-[43px] p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-[#fff] bg-ink text-[12px] font-bold whitespace-nowrap transition-[background,transform] duration-[180ms] [&:hover:not(:disabled)]:bg-[#3f5849] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&:disabled]:opacity-[.5] [&_svg]:w-[17px] [&_svg]:h-[17px] max-[520px]:[align-self:flex-start]"} type="button" onClick={startScene}><PlusIcon /> Add scene</button></div>
              {listError && <div className={"notice mt-[23px] p-[12px_14px] rounded-[6px] text-[12px] leading-[1.5] [&.error]:text-[#7d2e24] [&.error]:bg-[#f9eae7] error"} role="alert">{listError} <button className={"text-button p-0 border-0 [background:none] text-[#eed0bc] text-[12px] underline [text-underline-offset:3px]"} type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>}
              {listLoading && <div className={"center-state [&_h1]:m-0 [&_h1]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h1]:text-[clamp(38px,_4.5vw,_57px)] [&_h1]:font-normal [&_h1]:tracking-[-.025em] [&_h1]:leading-[1.12] [&_h1]:[overflow-wrap:anywhere] p-[80px_0] text-subtle text-[14px] [&_h1]:text-[#272523] [&_p]:m-[18px_0_24px] [&_p]:leading-[1.5]"} role="status">Loading storyboard…</div>}
              {!listLoading && !listError && scenes.length === 0 && <div className={"workspace-empty flex items-start flex-col justify-center min-h-[420px] p-[clamp(30px,_5vw,_70px)] [border:1px_dashed_#d7cfc5] rounded-[12px] bg-cream [&_>_svg]:w-[48px] [&_>_svg]:h-[48px] [&_>_svg]:text-rust [&_h2]:m-[24px_0_0] [&_h2]:text-ink [&_h2]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h2]:text-[30px] [&_h2]:font-normal [&_p]:max-w-[48ch] [&_p]:m-[12px_0_25px] [&_p]:text-muted [&_p]:text-[14px] [&_p]:leading-[1.6] max-[760px]:min-h-[320px] max-[760px]:p-[30px_25px]"}><FrameIcon /><h2>Start with a scene</h2><p>Each scene is a moment in your story. Add one, then arrange its shots on the canvas.</p><button className={"primary-button inline-flex items-center justify-center gap-[13px] min-h-[43px] p-[10px_16px] [border:1px_solid_#293c32] rounded-[6px] text-[#fff] bg-ink text-[12px] font-bold whitespace-nowrap transition-[background,transform] duration-[180ms] [&:hover:not(:disabled)]:bg-[#3f5849] [&:hover:not(:disabled)]:[transform:translateY(-1px)] [&:disabled]:opacity-[.5] [&_svg]:w-[17px] [&_svg]:h-[17px] max-[520px]:[align-self:flex-start]"} type="button" onClick={startScene}>Create your first scene <ArrowIcon /></button></div>}
              {!listLoading && !listError && scenes.length > 0 && <Suspense fallback={<div className={"center-state [&_h1]:m-0 [&_h1]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h1]:text-[clamp(38px,_4.5vw,_57px)] [&_h1]:font-normal [&_h1]:tracking-[-.025em] [&_h1]:leading-[1.12] [&_h1]:[overflow-wrap:anywhere] p-[80px_0] text-subtle text-[14px] [&_h1]:text-[#272523] [&_p]:m-[18px_0_24px] [&_p]:leading-[1.5]"} role="status">Opening storyboard…</div>}><SceneFlow scenes={scenes} onOpen={(id) => selectScene(id)} onReorder={reorderScenes} busy={saving} /></Suspense>}
            </section>
          )}
          {!selectedId && creatingScene && (
            <section className={"editor create-workspace [&_.editor-panel]:max-w-[860px]"} aria-labelledby="create-heading">
              <div className={"workspace-heading flex items-end justify-between gap-[24px] mb-[22px] [&_h1]:m-0 [&_h1]:text-ink [&_h1]:[font-family:Georgia,_'Times_New_Roman',_serif] [&_h1]:text-[clamp(34px,_3vw,_48px)] [&_h1]:font-normal [&_h1]:tracking-[-.025em] [&_h1]:leading-[1.15] [&_h1]:[overflow-wrap:anywhere] [&_p]:max-w-[66ch] [&_p]:m-[10px_0_0] [&_p]:text-muted [&_p]:text-[13px] [&_p]:leading-[1.55] [&_.primary-button]:flex-none [&_.secondary-button]:flex-none max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-[17px] max-[760px]:[&_h1]:text-[35px]"}><div><button className={"workspace-back inline-flex m-[0_0_15px] p-[3px_0] border-0 text-[#925036] bg-transparent text-[12px] font-bold [&:hover]:text-[#603a28] [&:hover]:underline [&:hover]:[text-underline-offset:3px]"} type="button" onClick={() => selectScene(null)}>← Back to storyboard</button><h1 id="create-heading">Create a scene</h1><p>Give this moment a name. You can add shots next.</p></div></div>
              <div className={"editor-panel p-[clamp(28px,_4.8vw,_55px)] bg-[#fff] [border:1px_solid_#e7e1da] rounded-[12px] shadow-[0_12px_28px_-20px_rgba(48,_35,_24,_.27)] max-[520px]:p-[24px_20px]"}><SceneForm busy={saving} error={saveError} onSubmit={createScene} /></div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
