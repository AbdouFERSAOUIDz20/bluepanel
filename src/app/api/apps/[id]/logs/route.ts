import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NextRequest, NextResponse } from 'next/server';
import { getAppById } from '@/lib/apps';

export const runtime = 'nodejs';

function logPath(appName: string) {
  return path.join(os.homedir(), 'logs', `${appName}.log`);
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const appId = Number(params.id);

  if (!Number.isFinite(appId)) {
    return NextResponse.json({ error: 'Invalid app id' }, { status: 400 });
  }

  const app = await getAppById(appId);
  if (!app) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  const filePath = logPath(app.name);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json([]);
  }

  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .slice(-200);

  return NextResponse.json(lines);
}
