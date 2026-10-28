import { NextRequest, NextResponse } from 'next/server';
import { database } from '../../../../lib/db';
import { hashToken, secureEqual, sessionOptions, sessionToken, SESSION_COOKIE } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  const { password } = await request.json().catch(() => ({})); const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return NextResponse.json({ error: 'ADMIN_PASSWORD is not configured.' }, { status: 503 });
  if (typeof password !== 'string' || !secureEqual(password, configured)) return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  const token = sessionToken(); await database.saveSession(hashToken(token), new Date(Date.now() + sessionOptions.maxAge * 1000));
  const response = NextResponse.json({ ok: true }); response.cookies.set(SESSION_COOKIE, token, sessionOptions); return response;
}
