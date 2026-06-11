import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import { dbExecute, dbQuery } from './db';

export type AppType = 'nodejs' | 'python';
export type AppStatus = 'running' | 'stopped' | 'installing' | 'error';

export interface AppRecord {
  id: number;
  name: string;
  type: AppType;
  directory: string;
  entry_file: string;
  github_url: string | null;
  status: AppStatus;
  passenger_app_id: string | null;
  created_at?: Date;
}

export function slugifyAppName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'app';
}

export function appsRoot() {
  return path.join(os.homedir(), 'apps');
}

export function appDirectoryForName(name: string) {
  return path.join(appsRoot(), slugifyAppName(name));
}

function findAppMarker(directory: string, marker: 'package.json' | 'requirements.txt', depth = 0): string | null {
  if (depth > 6) {
    return null;
  }

  const directPath = path.join(directory, marker);
  if (fs.existsSync(directPath)) {
    return directory;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nested = findAppMarker(path.join(directory, entry.name), marker, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function resolveAppRoot(directory: string) {
  return findAppMarker(directory, 'package.json') ?? findAppMarker(directory, 'requirements.txt') ?? directory;
}

export async function detectAppType(directory: string): Promise<AppType> {
  const appRoot = resolveAppRoot(directory);

  if (fs.existsSync(path.join(appRoot, 'package.json'))) {
    return 'nodejs';
  }

  if (fs.existsSync(path.join(appRoot, 'requirements.txt'))) {
    return 'python';
  }

  throw new Error('Unable to detect app type from package.json or requirements.txt');
}

export async function insertAppRecord(input: {
  name: string;
  type: AppType;
  directory: string;
  entryFile?: string;
  githubUrl?: string | null;
  status?: AppStatus;
  passengerAppId?: string | null;
}) {
  const result = await dbExecute<mysql.ResultSetHeader>(
    'INSERT INTO apps (name, type, directory, entry_file, github_url, status, passenger_app_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      input.name,
      input.type,
      input.directory,
      input.entryFile ?? 'index.js',
      input.githubUrl ?? null,
      input.status ?? 'stopped',
      input.passengerAppId ?? null
    ]
  );

  return {
    id: result.insertId,
    name: input.name,
    type: input.type,
    directory: input.directory,
    entry_file: input.entryFile ?? 'index.js',
    github_url: input.githubUrl ?? null,
    status: input.status ?? 'stopped',
    passenger_app_id: input.passengerAppId ?? null
  } satisfies AppRecord;
}

export async function getAppById(id: number) {
  const rows = await dbQuery<AppRecord[]>('SELECT * FROM apps WHERE id = ? LIMIT 1', [id]);
  return rows[0] ?? null;
}

export async function updateAppStatus(id: number, status: AppStatus, passengerAppId?: string | null) {
  await dbExecute(
    'UPDATE apps SET status = ?, passenger_app_id = COALESCE(?, passenger_app_id) WHERE id = ?',
    [status, passengerAppId ?? null, id]
  );
}

export async function updateAppEnvPath(id: number, directory: string) {
  await dbExecute('UPDATE apps SET directory = ? WHERE id = ?', [directory, id]);
}

// Process tracking for local app execution (dev mode)
const runningProcesses = new Map<number, ChildProcess>();

export async function startAppProcess(app: AppRecord) {
  // Kill any existing process
  const existing = runningProcesses.get(app.id);
  if (existing && !existing.killed) {
    existing.kill();
    runningProcesses.delete(app.id);
  }

  const appRoot = resolveAppRoot(app.directory);
  console.log(`[App Process] Starting ${app.name} in ${appRoot}`);

  let cmd: string;
  let args: string[];

  if (app.type === 'nodejs') {
    // Try to use "npm start" if available, otherwise "node entry_file"
    const packageJsonPath = path.join(appRoot, 'package.json');
    const hasNpmStart = fs.existsSync(packageJsonPath);
    
    if (hasNpmStart) {
      cmd = 'npm';
      args = ['start'];
    } else {
      cmd = 'node';
      args = [app.entry_file];
    }
  } else if (app.type === 'python') {
    cmd = 'python';
    args = [app.entry_file];
  } else {
    throw new Error(`Unknown app type: ${app.type}`);
  }

  const proc = spawn(cmd, args, {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32' ? 'cmd.exe' : undefined
  });

  // Log output
  proc.stdout?.on('data', (data) => {
    console.log(`[${app.name}:stdout] ${data.toString().trim()}`);
  });

  proc.stderr?.on('data', (data) => {
    console.log(`[${app.name}:stderr] ${data.toString().trim()}`);
  });

  proc.on('error', (err) => {
    console.error(`[${app.name}] Process error:`, err);
    runningProcesses.delete(app.id);
  });

  proc.on('exit', (code) => {
    console.log(`[${app.name}] Process exited with code ${code}`);
    runningProcesses.delete(app.id);
  });

  runningProcesses.set(app.id, proc);
  console.log(`[App Process] Started ${app.name} (PID: ${proc.pid})`);

  return proc;
}

export async function stopAppProcess(id: number) {
  const proc = runningProcesses.get(id);
  if (proc && !proc.killed) {
    console.log(`[App Process] Stopping process ${id} (PID: ${proc.pid})`);
    proc.kill();
    // Give it a moment to exit gracefully before forcing
    await new Promise((r) => setTimeout(r, 500));
    if (!proc.killed) {
      proc.kill('SIGKILL');
    }
    runningProcesses.delete(id);
  }
}

export function isAppProcessRunning(id: number): boolean {
  const proc = runningProcesses.get(id);
  return proc !== undefined && !proc.killed;
}
