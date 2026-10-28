import { database } from '../../../lib/db';

export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(await database.publicStatus(), { headers: { 'Cache-Control': 'no-store' } }); }
