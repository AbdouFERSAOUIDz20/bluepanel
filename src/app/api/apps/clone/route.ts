import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { NextRequest, NextResponse } from 'next/server';
import { appDirectoryForName, detectAppType, insertAppRecord, slugifyAppName } from '@/lib/apps';

export const runtime = 'nodejs';

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function buildCloneUrl(githubUrl: string, githubToken?: string) {
  const parsed = new URL(githubUrl);

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    throw new Error('Only https://github.com URLs are supported');
  }

  if (!githubToken) {
    return `https://github.com${parsed.pathname}${parsed.search}`;
  }

  return `https://${encodeURIComponent(githubToken)}@github.com${parsed.pathname}${parsed.search}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      github_url?: string;
      github_token?: string;
    };

    if (!body.name || !body.github_url) {
      return NextResponse.json({ error: 'name and github_url are required' }, { status: 400 });
    }

    const name = slugifyAppName(body.name);
    const directory = appDirectoryForName(name);
    const cloneUrl = buildCloneUrl(body.github_url, body.github_token);

    fs.rmSync(directory, { recursive: true, force: true });
    execSync(`git clone ${shellQuote(cloneUrl)} ${shellQuote(directory)}`, {
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0'
      }
    });

    const type = await detectAppType(directory);
    const app = await insertAppRecord({
      name,
      type,
      directory,
      entryFile: 'index.js',
      githubUrl: body.github_url,
      status: 'installing'
    });

    return NextResponse.json({
      id: app.id,
      name: app.name,
      type,
      directory
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Clone failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
