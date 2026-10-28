import { NextRequest, NextResponse } from 'next/server';
import { database } from '../../../lib/db';
import { validateParticipant } from '../../../lib/validation';

const attempts = new Map<string, { count: number; resetAt: number }>();
function allowed(request: NextRequest) { const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'; const now = Date.now(); const entry = attempts.get(key); if (!entry || entry.resetAt < now) { attempts.set(key, { count: 1, resetAt: now + 60_000 }); return true; } entry.count++; return entry.count <= 12; }

export async function POST(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: 'Please wait a minute before trying again.' }, { status: 429 });
  const parsed = validateParticipant(await request.json().catch(() => ({})));
  if (!parsed.valid) return NextResponse.json({ errors: parsed.errors }, { status: 422 });
  const duplicate = await database.duplicate(parsed.phone, parsed.icNumber); const errors: Record<string, string> = {};
  if (duplicate.phone) errors.phone = 'This phone number is already registered.';
  if (duplicate.icNumber) errors.icNumber = 'This IC number is already registered.';
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 409 });
  try { await database.register(parsed.fullName, parsed.phone, parsed.icNumber); return NextResponse.json({ ok: true }, { status: 201 }); }
  catch (error: any) { if (error?.code === 'ER_DUP_ENTRY') return NextResponse.json({ errors: { form: 'This participant is already registered.' } }, { status: 409 }); throw error; }
}
