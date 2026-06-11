import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getAppById } from '@/lib/apps';

export const runtime = 'nodejs';

function serializeEnv(vars: Record<string, string>) {
  return Object.entries(vars)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, value]) => `${key.trim()}=${String(value).replace(/\r?\n/g, '\\n')}`)
    .join('\n')
    .concat('\n');
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const appId = Number(params.id);

  if (!Number.isFinite(appId)) {
    return NextResponse.json({ error: 'Invalid app id' }, { status: 400 });
  }

  const app = await getAppById(appId);
  if (!app) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  const body = (await request.json()) as { vars?: Record<string, string> };
  const vars = body.vars ?? {};
  const envPath = path.join(app.directory, '.env');
  fs.writeFileSync(envPath, serializeEnv(vars), 'utf8');

  return NextResponse.json({ success: true });
}
