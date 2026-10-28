import { NextRequest, NextResponse } from 'next/server';
import { database } from '../../../../../lib/db';
// The stage may be a separate projector browser, so it cannot rely on the
// administrator's session cookie. Starting a draw remains admin-only; this
// endpoint can only close the already-reserved draw identified by its ID.
export async function POST(_request: NextRequest, context: RouteContext<'/api/draws/[id]/complete'>) { const { id } = await context.params; const complete = await database.completeDraw(Number(id)); return NextResponse.json({ ok: complete }); }
