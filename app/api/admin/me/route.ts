import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, SESSION_COOKIE } from '../../../../lib/auth';
export async function GET(request: NextRequest) { return NextResponse.json({ authenticated: await isAdmin(request.cookies.get(SESSION_COOKIE)?.value) }, { headers: { 'Cache-Control': 'no-store' } }); }
