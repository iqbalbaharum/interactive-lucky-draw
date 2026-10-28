import { NextRequest, NextResponse } from 'next/server';
import { database } from '../../../../lib/db';
import { validateParticipant } from '../../../../lib/validation';

export async function POST(request: NextRequest) {
  const input = await request.json().catch(() => ({})); const parsed = validateParticipant(input);
  if (!parsed.valid) return NextResponse.json({ valid: false, errors: parsed.errors });
  const duplicate = await database.duplicate(parsed.phone, parsed.icNumber);
  const errors: Record<string, string> = {};
  if (duplicate.phone) errors.phone = 'This phone number is already registered.';
  if (duplicate.icNumber) errors.icNumber = 'This IC number is already registered.';
  return NextResponse.json({ valid: Object.keys(errors).length === 0, errors });
}
