import AdmZip from 'adm-zip';
import Busboy from 'busboy';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { appDirectoryForName, detectAppType, insertAppRecord, resolveAppRoot, slugifyAppName } from '@/lib/apps';

export const runtime = 'nodejs';

function ensureSafeExtractPath(targetRoot: string, entryName: string) {
  const resolvedRoot = path.resolve(targetRoot);
  const resolvedTarget = path.resolve(targetRoot, entryName);

  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`) && resolvedTarget !== resolvedRoot) {
    throw new Error(`Unsafe zip entry: ${entryName}`);
  }

  return resolvedTarget;
}

function extractZip(buffer: Buffer, targetDir: string) {
  const zip = new AdmZip(buffer);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of zip.getEntries()) {
    const targetPath = ensureSafeExtractPath(targetDir, entry.entryName);

    if (entry.isDirectory) {
      fs.mkdirSync(targetPath, { recursive: true });
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, entry.getData());
  }
}

async function parseMultipart(request: NextRequest) {
  const contentType = request.headers.get('content-type');

  if (!contentType?.includes('multipart/form-data')) {
    throw new Error('Expected multipart/form-data');
  }

  const body = request.body;

  if (!body) {
    throw new Error('Missing request body');
  }

  const bufferParts: Record<string, string> = {};
  let uploadBuffer: Buffer | null = null;
  const stream = Readable.fromWeb(body as unknown as ReadableStream);
  const busboy = Busboy({ headers: { 'content-type': contentType } });

  await new Promise<void>((resolve, reject) => {
    busboy.on('field', (name, value) => {
      bufferParts[name] = value;
    });

    busboy.on('file', (_fieldName, file, info) => {
      const chunks: Buffer[] = [];

      file.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      file.on('end', () => {
        uploadBuffer = Buffer.concat(chunks);
        bufferParts.filename = info.filename ?? bufferParts.filename ?? 'upload.zip';
      });
    });

    busboy.on('error', reject);
    busboy.on('finish', () => resolve());

    stream.pipe(busboy);
  });

  return {
    fields: bufferParts,
    zipBuffer: uploadBuffer
  };
}

export async function POST(request: NextRequest) {
  try {
    const { fields, zipBuffer } = await parseMultipart(request);
    const name = (fields.name || fields.filename || 'app').trim();
    const slug = slugifyAppName(name);
    const directory = appDirectoryForName(slug);
    const entryFile = (fields.entry_file || 'index.js').trim() || 'index.js';

    if (!zipBuffer) {
      return NextResponse.json({ error: 'ZIP file is required' }, { status: 400 });
    }

    fs.mkdirSync(path.join(os.homedir(), 'apps'), { recursive: true });
    try {
      extractZip(zipBuffer, directory);
      const appRoot = resolveAppRoot(directory);
      const type = await detectAppType(appRoot);
      const app = await insertAppRecord({
        name: slug,
        type,
        directory: appRoot,
        entryFile,
        status: 'installing'
      });

      return NextResponse.json({
        id: app.id,
        name: app.name,
        type,
        directory: appRoot
      });
    } catch (error) {
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
