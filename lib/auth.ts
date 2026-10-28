import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { database } from './db';

export const SESSION_COOKIE = 'duck_draw_session';
export function hashToken(value: string) { const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'local-development-secret'; return createHmac('sha256', secret).update(value).digest('hex'); }
export function secureEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
export function sessionToken() { return randomBytes(32).toString('base64url'); }
export async function isAdmin(token?: string) { return Boolean(token) && database.validSession(hashToken(token)); }
export const sessionOptions = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 12 };
