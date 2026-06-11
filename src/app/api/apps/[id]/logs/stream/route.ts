import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NextRequest } from 'next/server';
import { getAppById } from '@/lib/apps';

export const runtime = 'nodejs';

function logPath(appName: string) {
  return path.join(os.homedir(), 'logs', `${appName}.log`);
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const appId = Number(params.id);

  if (!Number.isFinite(appId)) {
    return Response.json({ error: 'Invalid app id' }, { status: 400 });
  }

  const app = await getAppById(appId);
  if (!app) {
    return Response.json({ error: 'App not found' }, { status: 404 });
  }

  const filePath = logPath(app.name);
  let offset = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  let buffer = '';
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const emit = (line: string) => {
        controller.enqueue(encoder.encode(`data: ${line.replace(/\r?\n/g, ' ')}\n\n`));
      };

      const tick = () => {
        if (!fs.existsSync(filePath)) {
          return;
        }

        const stats = fs.statSync(filePath);
        if (stats.size <= offset) {
          return;
        }

        const data = fs.readFileSync(filePath);
        const chunk = data.subarray(offset, stats.size).toString('utf8');
        offset = stats.size;
        buffer += chunk;

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim().length > 0) {
            emit(line);
          }
        }
      };

      interval = setInterval(tick, 2000);
      tick();

      controller.enqueue(encoder.encode(': connected\n\n'));
    },
    cancel() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
