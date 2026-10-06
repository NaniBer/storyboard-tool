import { useEffect, useState, type FormEvent } from 'react';
import { sceneApi, type Scene } from './api';
import { Shots } from './Shots';

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
  return [...scenes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
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
};

function SceneForm({ scene, busy, error, onSubmit }: SceneFormProps) {
  const [title, setTitle] = useState(scene?.title ?? '');
  const [description, setDescription] = useState(scene?.description ?? '');
  const dirty = scene ? title !== scene.title || description !== scene.description : Boolean(title.trim() || description.trim());

  useEffect(() => {
    if (scene) {
      setTitle(scene.title);
      setDescription(scene.description);
    }
  }, [scene?.updatedAt]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || busy || (scene && !dirty)) return;
    void onSubmit(title.trim(), description.trim());
  }

  return (
    <form className="scene-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="scene-title">Scene title <span className="required" aria-hidden="true">*</span></label>
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
        <p className="field-hint">Give this moment a name you’ll recognize later.</p>
      </div>
      <div className="field">
        <label htmlFor="scene-description">Description <span className="optional">Optional</span></label>
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
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="form-footer">
        <p>{scene ? (dirty ? 'Unsaved changes' : `Last saved ${formattedDate(scene.updatedAt)}`) : 'You can add shots after creating the scene.'}</p>
        <button className="primary-button" type="submit" disabled={busy || !title.trim() || Boolean(scene && !dirty)}>
          {busy ? 'Saving…' : scene ? 'Save changes' : 'Create scene'}
          {!busy && <ArrowIcon />}
        </button>
      </div>
    </form>
  );
}

export function App() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(currentSceneId);
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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

  function selectScene(id: string | null) {
    if (id === selectedId || saving) return;
    setSceneInUrl(id);
    setSelectedId(id);
    setSaveError(null);
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

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Scenes">
        <div className="brand"><span className="brand-mark"><FrameIcon /></span><span>Storyboard<span className="brand-dot">.</span></span></div>
        <div className="sidebar-heading"><h2>Scenes</h2><span className="scene-count">{scenes.length}</span></div>
        <button className="new-scene-button" onClick={() => selectScene(null)} type="button" disabled={saving}><PlusIcon /> New scene</button>
        <nav className="scene-nav" aria-label="Scene list">
          {listLoading && <p className="sidebar-message" role="status">Loading scenes…</p>}
          {listError && <div className="sidebar-message"><p role="alert">{listError}</p><button className="text-button" type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>}
          {!listLoading && !listError && scenes.length === 0 && <p className="sidebar-message">Your scenes will appear here.</p>}
          {!listLoading && !listError && scenes.map((scene) => (
            <button
              key={scene.id}
              className={`scene-link${scene.id === selectedId ? ' selected' : ''}`}
              type="button"
              onClick={() => selectScene(scene.id)}
              disabled={saving}
              aria-current={scene.id === selectedId ? 'page' : undefined}
            >
              <span className="scene-link-title">{scene.title}</span>
              <span className="scene-link-date">Edited {formattedDate(scene.updatedAt)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">Your story starts one scene at a time.</div>
      </aside>

      <main className="main-area">
        <div className="topbar"><span>Workspace</span><span className="topbar-rule" /><span>Scenes</span></div>
        <div className="content-area">
          {selectedId && sceneLoading && <div className="center-state" role="status">Opening scene…</div>}
          {selectedId && !sceneLoading && sceneError && <div className="center-state"><h1>Couldn’t open this scene</h1><p role="alert">{sceneError}</p><button className="secondary-button" type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div>}
          {selectedId && !sceneLoading && selectedScene && (
            <section className="editor" aria-labelledby="editor-heading">
              <div className="editor-heading"><div><p className="editor-context">Scene details</p><h1 id="editor-heading">{selectedScene.title}</h1><p>Shape the moment, then build its shots.</p></div><span className="saved-chip">Saved scene</span></div>
              <div className="editor-panel"><SceneForm key={selectedScene.id} scene={selectedScene} busy={saving} error={saveError} onSubmit={updateScene} /></div>
              <Shots key={selectedScene.id} sceneId={selectedScene.id} />
            </section>
          )}
          {!selectedId && (
            <section className="editor" aria-labelledby="create-heading">
              <div className="editor-heading"><div><p className="editor-context">Start here</p><h1 id="create-heading">Create a scene</h1><p>Set the moment. The shots that tell it come next.</p></div></div>
              <div className="editor-panel"><SceneForm busy={saving} error={saveError} onSubmit={createScene} /></div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
