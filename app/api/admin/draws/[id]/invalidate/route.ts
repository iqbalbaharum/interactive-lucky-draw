import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, SESSION_COOKIE } from '../../../../../../lib/auth';
import { database } from '../../../../../../lib/db';

export async function POST(request: NextRequest, context: RouteContext<'/api/admin/draws/[id]/invalidate'>) {
  if (!await isAdmin(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) return NextResponse.json({ error: 'Invalid draw.' }, { status: 400 });
  try {
    const winner = await database.invalidateWinner(Number(id));
    return NextResponse.json({ ok: true, fullName: winner.fullName });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unable to return this winner to the draw.' }, { status: 409 });
  }
}
