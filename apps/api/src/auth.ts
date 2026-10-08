import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import type { SceneStore } from './scenes.js';

const passwordCost = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;

export type AuthConfig = {
  username: string;
  passwordHash: string;
  demoPassword?: string;
  allowedOrigin?: string;
  secureCookie: boolean;
  sameSite: 'lax' | 'none';
};

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, passwordCost, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  const salt = randomBytes(24);
  const key = await derivePassword(password, salt);
  return `scrypt-v1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function validPasswordHash(value: string): boolean {
  const parts = value.split('$');
  return parts.length === 3 && parts[0] === 'scrypt-v1'
    && Buffer.from(parts[1], 'base64url').length === 24
    && Buffer.from(parts[2], 'base64url').length === 64;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!validPasswordHash(encoded)) return false;
  const [, salt, expected] = encoded.split('$');
  const actual = await derivePassword(password, Buffer.from(salt, 'base64url'));
  return timingSafeEqual(actual, Buffer.from(expected, 'base64url'));
}

export function authConfigFromEnv(): AuthConfig {
  const passwordHash = process.env.AUTH_PASSWORD_HASH ?? '';
  if (!validPasswordHash(passwordHash)) {
    throw new Error('Set AUTH_PASSWORD_HASH in the server .env before starting the API.');
  }
  const sameSite = process.env.AUTH_COOKIE_SAME_SITE === 'none' ? 'none' : 'lax';
  const secureCookie = process.env.NODE_ENV === 'production';
  if (sameSite === 'none' && !secureCookie) throw new Error('SameSite=None requires HTTPS.');
  const demoPassword = process.env.AUTH_DEMO_LOGIN === 'true' ? process.env.AUTH_DEMO_PASSWORD : undefined;
  if (process.env.AUTH_DEMO_LOGIN === 'true' && (!demoPassword || demoPassword.length < 12)) {
    throw new Error('Set AUTH_DEMO_PASSWORD to at least 12 characters when AUTH_DEMO_LOGIN=true.');
  }
  return {
    username: process.env.AUTH_USERNAME?.trim() || 'ehudaiuser',
    passwordHash,
    demoPassword,
    allowedOrigin: process.env.AUTH_ALLOWED_ORIGIN?.trim() || undefined,
    secureCookie,
    sameSite,
  };
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, value] = part.trim().split('=', 2);
    if (key === name && value) return value;
  }
  return null;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function equalText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function installAuth(app: Express, store: SceneStore, config: AuthConfig): void {
  const cookieName = config.secureCookie ? '__Host-storyboard_session' : 'storyboard_session';
  const cookieOptions = {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: config.sameSite,
    path: '/',
  } as const;
  const failedLogins = new Map<string, { count: number; until: number }>();

  if (config.allowedOrigin) app.use(cors({ origin: config.allowedOrigin, credentials: true }));

  function checkOrigin(request: Request, response: Response): boolean {
    const origin = request.headers.origin;
    if (config.allowedOrigin && origin && origin !== config.allowedOrigin) {
      response.status(403).json({ error: 'This request came from an unrecognized site.' });
      return false;
    }
    return true;
  }

  function requireSession(request: Request, response: Response, next: NextFunction): void {
    const token = cookieValue(request, cookieName);
    const session = token ? store.getSession(tokenHash(token)) : null;
    if (!session) {
      response.status(401).json({ error: 'Please sign in to continue.' });
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!checkOrigin(request, response)) return;
      const csrfToken = request.header('x-csrf-token') ?? '';
      if (!equalText(csrfToken, session.csrfToken)) {
        response.status(403).json({ error: 'Your session needs to be refreshed. Reload the page and try again.' });
        return;
      }
    }
    response.locals.tokenHash = tokenHash(token!);
    response.locals.csrfToken = session.csrfToken;
    response.setHeader('Cache-Control', 'no-store');
    next();
  }

  function startSession(response: Response): void {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(24).toString('base64url');
    store.createSession(tokenHash(token), csrfToken, Date.now() + sessionLifetimeMs);
    response.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionLifetimeMs });
    response.setHeader('Cache-Control', 'no-store');
    response.json({ username: config.username, csrfToken });
  }

  app.get('/api/auth/options', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ temporaryLogin: config.demoPassword ? { username: config.username, password: config.demoPassword } : null });
  });

  app.post('/api/auth/login', async (request, response) => {
    if (!checkOrigin(request, response)) return;
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!username || !password || username.length > 120 || password.length > 256) {
      response.status(400).json({ error: 'Enter your username and password.' });
      return;
    }
    const ip = request.ip ?? 'unknown';
    const failure = failedLogins.get(ip);
    if (failure && failure.until > Date.now() && failure.count >= 5) {
      response.setHeader('Retry-After', String(Math.ceil((failure.until - Date.now()) / 1000)));
      response.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
      return;
    }
    const passwordMatches = username === config.username && (
      (config.demoPassword !== undefined && equalText(password, config.demoPassword))
      || await verifyPassword(password, config.passwordHash)
    );
    if (!passwordMatches || username !== config.username) {
      const count = failure && failure.until > Date.now() ? failure.count + 1 : 1;
      failedLogins.set(ip, { count, until: Date.now() + loginWindowMs });
      response.status(401).json({ error: 'Username or password is incorrect.' });
      return;
    }
    failedLogins.delete(ip);
    startSession(response);
  });

  app.get('/api/auth/me', requireSession, (_request, response) => {
    response.json({ username: config.username, csrfToken: response.locals.csrfToken });
  });

  app.post('/api/auth/logout', requireSession, (_request, response) => {
    store.deleteSession(response.locals.tokenHash);
    response.clearCookie(cookieName, cookieOptions);
    response.status(204).end();
  });

  app.use('/api', requireSession);
}
