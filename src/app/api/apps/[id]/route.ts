import fs from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { dbExecute } from '@/lib/db';
import { getAppById, stopAppProcess } from '@/lib/apps';

export const runtime = 'nodejs';

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const appId = Number(params.id);

  if (!Number.isFinite(appId)) {
    return NextResponse.json({ error: 'Invalid app id' }, { status: 400 });
  }

  const app = await getAppById(appId);
  if (!app) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  await stopAppProcess(app.id);
  fs.rmSync(app.directory, { recursive: true, force: true });
  await dbExecute('DELETE FROM apps WHERE id = ?', [appId]);

  return NextResponse.json({ success: true });
}
