import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { adminAuth } from '../config/firebaseAdmin.js';
import { getOrCreateUser } from '../services/userService.js';
import type { UserProfile } from '../../types.js';

export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  decodedToken?: {
    uid: string;
    email?: string;
    name?: string;
    picture?: string;
  };
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'yamrajm790@gmail.com').toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_SESSION_TTL_SECONDS = Math.max(900, Number(process.env.ADMIN_SESSION_TTL_SECONDS || 43200));

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function adminSessionSignature(payload: string): string {
  return crypto.createHmac('sha256', ADMIN_PASSWORD).update(payload).digest('base64url');
}

export function createAdminSessionToken(): string {
  if (!ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is not configured on the backend.');
  const payload = String(Date.now());
  return `${base64Url(payload)}.${adminSessionSignature(payload)}`;
}

export function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!ADMIN_PASSWORD || !token) return false;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;
  let payload = '';
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  if (issuedAt > Date.now() || Date.now() - issuedAt > ADMIN_SESSION_TTL_SECONDS * 1000) return false;
  const expected = adminSessionSignature(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function makeAdminProfile(): UserProfile {
  const now = new Date().toISOString();
  return {
    uid: 'admin-password-session',
    email: ADMIN_EMAIL,
    displayName: 'Administrator',
    photoURL: '',
    plan: 'free',
    isAdmin: true,
    isBanned: false,
    dailyMessageLimit: 20,
    dailyMessageCount: 0,
    lastUsageDate: now.slice(0, 10),
    rateLimitPerMinute: 60,
    premiumExpiresAt: null,
    customDailyMessageLimit: null,
    customRateLimitPerMinute: null,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
  };
}

export function requireAdminPasswordSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!verifyAdminSessionToken(req.header('x-admin-token'))) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  req.user = makeAdminProfile();
  req.decodedToken = { uid: 'admin-password-session', email: ADMIN_EMAIL, name: 'Administrator' };
  next();
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1].trim();
  let decodedToken;

  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : 'Invalid token';
    console.error('Firebase token verification error:', errMessage);
    res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    return;
  }

  try {
    let user = await getOrCreateUser({
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    });

    if (user.isBanned) {
      res.status(403).json({ error: 'Account has been suspended. Please contact support.' });
      return;
    }

    req.user = user;
    req.decodedToken = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };
    next();
  } catch (profileErr: unknown) {
    console.warn('Fallback profile creation during auth:', profileErr);
    const isInitialAdmin = Boolean(
      decodedToken.email && decodedToken.email.toLowerCase() === ADMIN_EMAIL
    );
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      displayName: decodedToken.name || decodedToken.email?.split('@')[0] || 'User',
      photoURL: decodedToken.picture || '',
      plan: 'free',
      isAdmin: isInitialAdmin,
      isBanned: false,
      dailyMessageLimit: 20,
      dailyMessageCount: 0,
      lastUsageDate: new Date().toISOString().slice(0, 10),
      rateLimitPerMinute: 5,
      premiumExpiresAt: null,
      customDailyMessageLimit: null,
      customRateLimitPerMinute: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    req.decodedToken = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };
    next();
  }
}

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (verifyAdminSessionToken(req.header('x-admin-token'))) {
    req.user = makeAdminProfile();
    req.decodedToken = { uid: 'admin-password-session', email: ADMIN_EMAIL, name: 'Administrator' };
    next();
    return;
  }

  await requireAuth(req, res, () => {
    const isAdmin = Boolean(
      req.user?.isAdmin ||
      (req.decodedToken?.email && req.decodedToken.email.toLowerCase() === ADMIN_EMAIL)
    );
    if (!isAdmin) {
      res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
      return;
    }
    next();
  });
}
