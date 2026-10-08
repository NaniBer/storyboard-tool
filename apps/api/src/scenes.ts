import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export type Scene = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type Shot = {
  id: string;
  sceneId: string;
  shotType: string;
  description: string;
  notes: string;
  prompt: string;
  status: 'draft' | 'approved';
  position: number;
  createdAt: string;
  updatedAt: string;
  image: ShotImage | null;
};

export type ImageStatus = 'queued' | 'processing' | 'ready' | 'failed';

export type ShotImage = {
  id: string;
  filename: string;
  status: ImageStatus;
  error: string | null;
  previewUrl: string | null;
  previousPreviewUrl: string | null;
};

export type StoredImage = {
  id: string;
  shot_id: string;
  filename: string;
  mime_type: string;
  original_path: string;
  preview_path: string | null;
  status: ImageStatus;
  error: string | null;
  attempt: number;
};

type ShotRow = {
  id: string;
  scene_id: string;
  shot_type: string;
  description: string;
  notes: string;
  prompt: string;
  status: 'draft' | 'approved';
  position: number;
  created_at: string;
  updated_at: string;
};

function toShot(row: ShotRow, image: ShotImage | null): Shot {
  return {
    id: row.id,
    sceneId: row.scene_id,
    shotType: row.shot_type,
    description: row.description,
    notes: row.notes,
    prompt: row.prompt,
    status: row.status,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    image,
  };
}

type SceneRow = {
  id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
};

function toScene(row: SceneRow): Scene {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const defaultDataDir = fileURLToPath(new URL('../../../data/', import.meta.url));

export function openSceneStore(dataDir = process.env.DATA_DIR || defaultDataDir) {
  const databasePath = join(dataDir, 'storyboard.sqlite');
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scenes_updated_at_idx ON scenes(updated_at DESC);
    CREATE TABLE IF NOT EXISTS shots (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      shot_type TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS shots_scene_position_idx ON shots(scene_id, position);
    CREATE TABLE IF NOT EXISTS shot_images (
      id TEXT PRIMARY KEY,
      shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      original_path TEXT NOT NULL,
      preview_path TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
      error TEXT,
      attempt INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (shot_id, attempt)
    );
    CREATE INDEX IF NOT EXISTS shot_images_shot_attempt_idx ON shot_images(shot_id, attempt DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      csrf_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
  `);

  const insertSession = database.prepare('INSERT INTO sessions (token_hash, csrf_token, expires_at) VALUES (?, ?, ?)');
  const selectSession = database.prepare<[string], { csrf_token: string; expires_at: number }>(
    'SELECT csrf_token, expires_at FROM sessions WHERE token_hash = ?',
  );
  const deleteSession = database.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const deleteExpiredSessions = database.prepare('DELETE FROM sessions WHERE expires_at <= ?');

  const selectScene = database.prepare<[string], SceneRow>(
    'SELECT id, title, description, created_at, updated_at FROM scenes WHERE id = ?',
  );
  const listScenes = database.prepare<[], SceneRow>(
    'SELECT id, title, description, created_at, updated_at FROM scenes ORDER BY updated_at DESC, id DESC',
  );
  const insertScene = database.prepare(
    'INSERT INTO scenes (id, owner_id, title, description, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, ?)',
  );
  const updateScene = database.prepare(
    'UPDATE scenes SET title = ?, description = ?, updated_at = ? WHERE id = ?',
  );
  const shotColumns = 'id, scene_id, shot_type, description, notes, prompt, status, position, created_at, updated_at';
  const selectShot = database.prepare<[string], ShotRow>(`SELECT ${shotColumns} FROM shots WHERE id = ?`);
  const listShots = database.prepare<[string], ShotRow>(`SELECT ${shotColumns} FROM shots WHERE scene_id = ? ORDER BY position ASC, id ASC`);
  const nextShotPosition = database.prepare<[string], { position: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM shots WHERE scene_id = ?',
  );
  const insertShot = database.prepare(
    'INSERT INTO shots (id, scene_id, shot_type, description, notes, prompt, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const updateShot = database.prepare(
    'UPDATE shots SET shot_type = ?, description = ?, notes = ?, prompt = ?, status = ?, updated_at = ? WHERE id = ?',
  );
  const setShotPosition = database.prepare('UPDATE shots SET position = ?, updated_at = ? WHERE id = ?');
  const deleteShot = database.prepare('DELETE FROM shots WHERE id = ?');
  const closeShotGaps = database.prepare('UPDATE shots SET position = position - 1 WHERE scene_id = ? AND position > ?');
  const latestImage = database.prepare<[string], StoredImage>(
    'SELECT * FROM shot_images WHERE shot_id = ? ORDER BY attempt DESC LIMIT 1',
  );
  const previousReadyImage = database.prepare<[string, number], StoredImage>(
    "SELECT * FROM shot_images WHERE shot_id = ? AND attempt < ? AND status = 'ready' ORDER BY attempt DESC LIMIT 1",
  );
  const latestReadyImage = database.prepare<[string], StoredImage>(
    "SELECT * FROM shot_images WHERE shot_id = ? AND status = 'ready' ORDER BY attempt DESC LIMIT 1",
  );
  const selectImage = database.prepare<[string], StoredImage>('SELECT * FROM shot_images WHERE id = ?');
  const imageFilesForShot = database.prepare<[string], { original_path: string; preview_path: string | null }>(
    'SELECT original_path, preview_path FROM shot_images WHERE shot_id = ?',
  );
  const pendingImages = database.prepare<[], { id: string }>(
    "SELECT id FROM shot_images WHERE status IN ('queued', 'processing') ORDER BY created_at ASC",
  );
  const nextImageAttempt = database.prepare<[string], { attempt: number }>(
    'SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt FROM shot_images WHERE shot_id = ?',
  );
  const insertImage = database.prepare(
    'INSERT INTO shot_images (id, shot_id, filename, mime_type, original_path, preview_path, status, error, attempt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)',
  );
  const updateImage = database.prepare(
    'UPDATE shot_images SET status = ?, error = ?, preview_path = ?, updated_at = ? WHERE id = ?',
  );

  return {
    dataDir,
    createSession(tokenHash: string, csrfToken: string, expiresAt: number): void {
      deleteExpiredSessions.run(Date.now());
      insertSession.run(tokenHash, csrfToken, expiresAt);
    },
    getSession(tokenHash: string): { csrfToken: string; expiresAt: number } | null {
      const session = selectSession.get(tokenHash);
      if (!session) return null;
      if (session.expires_at <= Date.now()) {
        deleteSession.run(tokenHash);
        return null;
      }
      return { csrfToken: session.csrf_token, expiresAt: session.expires_at };
    },
    deleteSession(tokenHash: string): void {
      deleteSession.run(tokenHash);
    },
    list(): Scene[] {
      return listScenes.all().map(toScene);
    },
    get(id: string): Scene | null {
      const row = selectScene.get(id);
      return row ? toScene(row) : null;
    },
    create(title: string, description: string): Scene {
      const id = randomUUID();
      const now = new Date().toISOString();
      insertScene.run(id, title, description, now, now);
      return this.get(id)!;
    },
    update(id: string, changes: { title?: string; description?: string }): Scene | null {
      const current = this.get(id);
      if (!current) return null;
      const now = new Date().toISOString();
      updateScene.run(changes.title ?? current.title, changes.description ?? current.description, now, id);
      return this.get(id);
    },
    listShots(sceneId: string): Shot[] {
      return listShots.all(sceneId).map((row) => toShot(row, this.getCurrentImage(row.id)));
    },
    getShot(id: string): Shot | null {
      const row = selectShot.get(id);
      return row ? toShot(row, this.getCurrentImage(row.id)) : null;
    },
    getCurrentImage(shotId: string): ShotImage | null {
      const current = latestImage.get(shotId);
      if (!current) return null;
      const previous = current.status === 'ready' ? null : previousReadyImage.get(shotId, current.attempt);
      return {
        id: current.id,
        filename: current.filename,
        status: current.status,
        error: current.error,
        previewUrl: current.status === 'ready' ? `/api/images/${current.id}/preview` : null,
        previousPreviewUrl: previous ? `/api/images/${previous.id}/preview` : null,
      };
    },
    getImage(id: string): StoredImage | null {
      return selectImage.get(id) ?? null;
    },
    getLatestReadyImage(shotId: string): StoredImage | null {
      return latestReadyImage.get(shotId) ?? null;
    },
    imageFilesForShot(shotId: string): string[] {
      return imageFilesForShot.all(shotId).flatMap((image) => [image.original_path, image.preview_path].filter((path): path is string => Boolean(path)));
    },
    pendingImageIds(): string[] {
      return pendingImages.all().map((row) => row.id);
    },
    addImage(shotId: string, image: { id: string; filename: string; mimeType: string; originalPath: string }): ShotImage {
      return database.transaction(() => {
        const now = new Date().toISOString();
        const attempt = nextImageAttempt.get(shotId)!.attempt;
        insertImage.run(image.id, shotId, image.filename, image.mimeType, image.originalPath, 'queued', attempt, now, now);
        return this.getCurrentImage(shotId)!;
      })();
    },
    setImageState(id: string, status: ImageStatus, error: string | null = null, previewPath: string | null = null): void {
      updateImage.run(status, error, previewPath, new Date().toISOString(), id);
    },
    createShot(sceneId: string, fields: { shotType: string; description: string; notes: string; prompt: string }): Shot {
      return database.transaction(() => {
        const id = randomUUID();
        const now = new Date().toISOString();
        const position = nextShotPosition.get(sceneId)!.position;
        insertShot.run(id, sceneId, fields.shotType, fields.description, fields.notes, fields.prompt, 'draft', position, now, now);
        return this.getShot(id)!;
      })();
    },
    updateShot(id: string, changes: Partial<Pick<Shot, 'shotType' | 'description' | 'notes' | 'prompt' | 'status'>>): Shot | null {
      const current = this.getShot(id);
      if (!current) return null;
      updateShot.run(
        changes.shotType ?? current.shotType,
        changes.description ?? current.description,
        changes.notes ?? current.notes,
        changes.prompt ?? current.prompt,
        changes.status ?? current.status,
        new Date().toISOString(),
        id,
      );
      return this.getShot(id);
    },
    orderShots(sceneId: string, ids: string[]): Shot[] | null {
      return database.transaction(() => {
        const current = this.listShots(sceneId);
        if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((id) => !current.some((shot) => shot.id === id))) {
          return null;
        }
        const now = new Date().toISOString();
        ids.forEach((id, position) => setShotPosition.run(position, now, id));
        return this.listShots(sceneId);
      })();
    },
    deleteShot(id: string): boolean {
      return database.transaction(() => {
        const shot = this.getShot(id);
        if (!shot) return false;
        deleteShot.run(id);
        closeShotGaps.run(shot.sceneId, shot.position);
        return true;
      })();
    },
    close() {
      database.close();
    },
  };
}

export type SceneStore = ReturnType<typeof openSceneStore>;
