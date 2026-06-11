import { NextRequest, NextResponse } from 'next/server';
import { getAppById, updateAppStatus, startAppProcess } from '@/lib/apps';

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

    await startAppProcess(app);
    await updateAppStatus(app.id, 'running');

    return NextResponse.json({ success: true, message: 'App started locally' });
  } catch (error) {
    console.error('[start route] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start app';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
