import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, SESSION_COOKIE } from '../../../../lib/auth';
import { database } from '../../../../lib/db';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) { if (!await isAdmin(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const search = new URL(request.url).searchParams.get('search')?.trim() || ''; const [counts, activeDraw, participants, history] = await Promise.all([database.counts(), database.activeDraw(), database.participants(search), database.history()]); return NextResponse.json({ ...counts, activeDraw, participants, history }, { headers: { 'Cache-Control': 'no-store' } }); }
