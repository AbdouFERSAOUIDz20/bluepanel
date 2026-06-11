import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { getAppById, updateAppStatus } from '@/lib/apps';

export const runtime = 'nodejs';

function toSseLine(line: string) {
  return `data: ${line.replace(/\r?\n/g, ' ')}\n\n`;
}

function streamProcess(command: string, args: string[], cwd: string, emit: (line: string) => void) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: process.env
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    const pushBuffer = (buffer: string, chunk: string, sink: (line: string) => void) => {
      let current = buffer + chunk;
      const lines = current.split(/\r?\n/);
      current = lines.pop() ?? '';

      for (const line of lines) {
        if (line.length > 0) {
          sink(line);
        }
      }

      return current;
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer = pushBuffer(stdoutBuffer, chunk.toString('utf8'), emit);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer = pushBuffer(stderrBuffer, chunk.toString('utf8'), emit);
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (stdoutBuffer.trim()) {
        emit(stdoutBuffer.trim());
      }

      if (stderrBuffer.trim()) {
        emit(stderrBuffer.trim());
      }

      resolve(code ?? 1);
    });
  });
}

async function installPythonRequirements(
  python: string,
  requirements: string,
  vendor: string,
  emit: (line: string) => void
) {
  emit('Upgrading pip, setuptools, and wheel');
  const bootstrapCode = await streamProcess(
    python,
    ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'],
    path.dirname(requirements),
    emit
  );

  if (bootstrapCode !== 0) {
    return bootstrapCode;
  }

  emit('Installing Python requirements with binary preference');
  return streamProcess(
    python,
    ['-m', 'pip', 'install', '--prefer-binary', '-r', requirements, '--target', vendor],
    path.dirname(requirements),
    emit
  );
}

async function createPythonFallbackRequirements(requirementsPath: string) {
  const original = await fs.readFile(requirementsPath, 'utf8');
  const filtered = original
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.replace(/discord\.py\[voice\]/i, 'discord.py'))
    .filter((line) => !/^PyNaCl(\b|[<>=])/i.test(line));

  const fallbackPath = path.join(os.tmpdir(), `bluepanel-requirements-${Date.now()}.txt`);
  await fs.writeFile(fallbackPath, filtered.join('\n') + '\n', 'utf8');
  return fallbackPath;
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appId = Number(id);

  if (!Number.isFinite(appId)) {
    return Response.json({ error: 'Invalid app id' }, { status: 400 });
  }

  const app = await getAppById(appId);
  if (!app) {
    return Response.json({ error: 'App not found' }, { status: 404 });
  }

  await updateAppStatus(app.id, 'installing');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const emit = (line: string) => {
        controller.enqueue(encoder.encode(toSseLine(line)));
      };

      emit(`Starting install for ${app.name}`);

      if (app.type === 'python') {
        const python = process.platform === 'win32' ? 'python' : 'python3';
        const requirements = path.join(app.directory, 'requirements.txt');
        const vendor = path.join(app.directory, 'vendor');
        installPythonRequirements(python, requirements, vendor, emit)
          .then(async (code) => {
            if (code === 0) {
              await updateAppStatus(app.id, 'stopped');
              emit('Install finished successfully');
              controller.close();
              return;
            }

            const requirementsText = await fs.readFile(requirements, 'utf8').catch(() => '');
            const shouldRetryWithoutVoice = /discord\.py\[voice\]/i.test(requirementsText) || /PyNaCl/i.test(requirementsText);

            if (shouldRetryWithoutVoice) {
              emit('Retrying install without voice extras to avoid PyNaCl build issues');
              const fallbackRequirements = await createPythonFallbackRequirements(requirements);
              const retryCode = await streamProcess(
                python,
                ['-m', 'pip', 'install', '--prefer-binary', '-r', fallbackRequirements, '--target', vendor],
                path.dirname(requirements),
                emit
              );

              await fs.unlink(fallbackRequirements).catch(() => undefined);

              if (retryCode === 0) {
                await updateAppStatus(app.id, 'stopped');
                emit('Install finished successfully');
                controller.close();
                return;
              }

              await updateAppStatus(app.id, 'error');
              emit(`Install failed with exit code ${retryCode}`);
              controller.close();
              return;
            }

            await updateAppStatus(app.id, 'error');
            emit(`Install failed with exit code ${code}`);
            controller.close();
          })
          .catch(async (error) => {
            await updateAppStatus(app.id, 'error');
            emit(error instanceof Error ? error.message : 'Install failed');
            controller.close();
          });

        return;
      }

      if (process.platform === 'win32') {
        streamProcess('cmd.exe', ['/c', 'npm', 'install', '--prefix', app.directory], app.directory, emit)
          .then(async (code) => {
            if (code === 0) {
              await updateAppStatus(app.id, 'stopped');
              emit('Install finished successfully');
              controller.close();
              return;
            }

            await updateAppStatus(app.id, 'error');
            emit(`Install failed with exit code ${code}`);
            controller.close();
          })
          .catch(async (error) => {
            await updateAppStatus(app.id, 'error');
            emit(error instanceof Error ? error.message : 'Install failed');
            controller.close();
          });

        return;
      }

      streamProcess('npm', ['install', '--prefix', app.directory], app.directory, emit)
        .then(async (code) => {
          if (code === 0) {
            await updateAppStatus(app.id, 'stopped');
            emit('Install finished successfully');
            controller.close();
            return;
          }

          await updateAppStatus(app.id, 'error');
          emit(`Install failed with exit code ${code}`);
          controller.close();
        })
        .catch(async (error) => {
          await updateAppStatus(app.id, 'error');
          emit(error instanceof Error ? error.message : 'Install failed');
          controller.close();
        });
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
