import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/db';
import type { AppRecord } from '@/lib/apps';

export const runtime = 'nodejs';

export async function GET() {
  const apps = await dbQuery<AppRecord[]>('SELECT * FROM apps ORDER BY created_at DESC, id DESC');
  return NextResponse.json(apps);
}
