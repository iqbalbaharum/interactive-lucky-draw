import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, SESSION_COOKIE } from '../../../../../lib/auth';
import { database } from '../../../../../lib/db';

export async function POST(request: NextRequest) {
  if (!await isAdmin(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json({ activeDraw: await database.hitDraw() }); }
  catch (error: any) { return NextResponse.json({ error: error.message || 'Unable to hit the draw.' }, { status: 409 }); }
}
