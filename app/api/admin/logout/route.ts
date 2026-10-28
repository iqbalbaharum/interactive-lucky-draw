import { NextRequest, NextResponse } from 'next/server';
import { database } from '../../../../lib/db';
import { hashToken, SESSION_COOKIE, sessionOptions } from '../../../../lib/auth';

export async function POST(request: NextRequest) { const token = request.cookies.get(SESSION_COOKIE)?.value; if (token) await database.deleteSession(hashToken(token)); const response = NextResponse.json({ ok: true }); response.cookies.set(SESSION_COOKIE, '', { ...sessionOptions, maxAge: 0 }); return response; }
