import { NextRequest, NextResponse } from 'next/server';
import { getAppById, updateAppStatus, stopAppProcess } from '@/lib/apps';

export const runtime = 'nodejs';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const appId = Number(params.id);

    if (!Number.isFinite(appId)) {
      return NextResponse.json({ error: 'Invalid app id' }, { status: 400 });
    }

    const app = await getAppById(appId);
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    await stopAppProcess(app.id);
    await updateAppStatus(app.id, 'stopped');

    return NextResponse.json({ success: true, message: 'App stopped locally' });
  } catch (error) {
    console.error('[stop route] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to stop app';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
