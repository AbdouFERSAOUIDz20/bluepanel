"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

type EnvRow = {
  key: string;
  value: string;
};

type UploadResult = {
  id: number;
  name: string;
  type: 'nodejs' | 'python';
  directory: string;
};

async function readErrorMessage(response: Response, fallback: string) {
  const text = (await response.text()).trim();

  if (!text) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as { error?: string };
    return payload.error || fallback;
  } catch {
    return text;
  }
}

const defaultEnvRows: EnvRow[] = [{ key: '', value: '' }];

export default function NewAppPage() {
  const [tab, setTab] = useState<'upload' | 'github'>('upload');
  const [name, setName] = useState('');
  const [entryFile, setEntryFile] = useState('index.js');
  const [githubUrl, setGithubUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [envRows, setEnvRows] = useState<EnvRow[]>(defaultEnvRows);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installComplete, setInstallComplete] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([
    'Ready to upload.',
    'Install output will stream here after upload.'
  ]);
  const terminalRef = useRef<HTMLDivElement | null>(null);

  const terminalLines = useMemo(() => {
    return logLines;
  }, [logLines]);

  useEffect(() => {
    const element = terminalRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [logLines]);

  function updateEnvRow(index: number, field: keyof EnvRow, value: string) {
    setEnvRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  }

  function addEnvRow() {
    setEnvRows((current) => [...current, { key: '', value: '' }]);
  }

  async function submitUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus('Uploading ZIP...');
    setLogLines(['Uploading ZIP...', 'Waiting for upload response...']);
    setInstallComplete(false);
    setResult(null);

    try {
      const formData = new FormData();
      if (file) {
        formData.set('file', file);
      }
      formData.set('name', name);
      formData.set('entry_file', entryFile || 'index.js');
      const response = await fetch('/api/apps/upload', {
        method: 'POST',
        body: formData
      });

      const payload = (await response.json()) as UploadResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Upload failed');
      }

      setResult(payload);
      setStatus('Upload complete. Streaming install output...');
      setLogLines((current) => [...current, `Created app ${payload.name} (${payload.type})`, `Directory: ${payload.directory}`]);
      await streamInstall(payload.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function streamInstall(appId: number) {
    setIsInstalling(true);
    setLogLines((current) => [...current, `Starting install for app #${appId}`]);

    const response = await fetch(`/api/apps/${appId}/install`, {
      method: 'POST'
    });

    if (!response.ok || !response.body) {
      throw new Error('Install stream failed to start');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const appendLine = (line: string) => {
      setLogLines((current) => [...current, line]);
    };

    const flushBuffer = (value: string) => {
      buffer += value;
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const dataLines = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, '').trim());

        if (dataLines.length > 0) {
          appendLine(dataLines.join('\n'));
        }
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      flushBuffer(decoder.decode(value, { stream: true }));
    }

    if (buffer.trim()) {
      const tail = buffer
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, '').trim())
        .join('\n');

      if (tail) {
        appendLine(tail);
      }
    }

    setInstallComplete(true);
    setIsInstalling(false);
    setStatus('Install complete. Start Bot is now available.');
  }

  async function startApp() {
    if (!result) {
      return;
    }

    setStatus('Starting app...');

    try {
      const response = await fetch(`/api/apps/${result.id}/start`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Start failed'));
      }

      setStatus('App started successfully.');
      setLogLines((current) => [...current, 'Start command sent locally.']);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Start failed');
    }
  }

  async function submitGitHub(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus('Cloning repository...');
    setLogLines(['Cloning GitHub repository...', 'Waiting for clone response...']);
    setInstallComplete(false);
    setResult(null);

    try {
      const response = await fetch('/api/apps/clone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          github_url: githubUrl,
          github_token: githubToken || undefined,
          entry_file: entryFile
        })
      });

      const payload = (await response.json()) as UploadResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Clone failed');
      }

      setResult(payload);
      setStatus('Clone complete. Streaming install output...');
      setLogLines((current) => [...current, `Created app ${payload.name} (${payload.type})`, `Directory: ${payload.directory}`]);
      await streamInstall(payload.id);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Clone failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-on-surface md:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.3em] text-on-surface-variant">BluePanel</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">Upload & Run Bot</h1>
          <p className="max-w-3xl text-sm text-on-surface-variant md:text-base">
            Upload a ZIP or prepare a GitHub deployment. This first slice wires the upload path and the app shell.
          </p>
        </header>

        <section className="grid gap-8 xl:grid-cols-[1.25fr_0.9fr]">
          <div className="glass-panel rounded-xl p-5 md:p-6">
            <div className="flex gap-2 rounded-lg bg-black/20 p-1">
              <button
                type="button"
                onClick={() => setTab('upload')}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'upload' ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                Upload ZIP
              </button>
              <button
                type="button"
                onClick={() => setTab('github')}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'github' ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                GitHub
              </button>
            </div>

            {tab === 'upload' ? (
              <form className="mt-6 space-y-5" onSubmit={submitUpload}>
                <label className="block space-y-2">
                  <span className="text-sm text-on-surface-variant">App name</span>
                  <input
                    className="w-full rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="my-bot"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-on-surface-variant">Entry file</span>
                  <input
                    className="w-full rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                    value={entryFile}
                    onChange={(event) => setEntryFile(event.target.value)}
                    placeholder="index.js"
                  />
                </label>

                <label className="block space-y-2 rounded-xl border border-dashed border-white/15 bg-black/10 p-5 transition hover:border-white/25">
                  <span className="text-sm text-on-surface-variant">Upload ZIP</span>
                  <input
                    className="mt-2 block w-full text-sm text-on-surface-variant file:mr-4 file:rounded-md file:border-0 file:bg-primary-container file:px-4 file:py-2 file:text-white"
                    type="file"
                    accept=".zip,application/zip"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </label>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-on-surface-variant">Env vars</span>
                    <button type="button" onClick={addEnvRow} className="text-sm text-primary hover:underline">
                      Add row
                    </button>
                  </div>
                  <div className="space-y-2">
                    {envRows.map((row, index) => (
                      <div key={`${index}-${row.key}`} className="grid gap-2 md:grid-cols-[1fr_1.3fr]">
                        <input
                          className="rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                          value={row.key}
                          onChange={(event) => updateEnvRow(index, 'key', event.target.value)}
                          placeholder="KEY"
                        />
                        <input
                          className="rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                          value={row.value}
                          onChange={(event) => updateEnvRow(index, 'value', event.target.value)}
                          placeholder="VALUE"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center rounded-md bg-gradient-to-r from-primary-container to-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Uploading...' : 'Upload & Deploy'}
                </button>
              </form>
            ) : (
              <form className="mt-6 space-y-5" onSubmit={submitGitHub}>
                <label className="block space-y-2">
                  <span className="text-sm text-on-surface-variant">Repository URL</span>
                  <input
                    className="w-full rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                    value={githubUrl}
                    onChange={(event) => setGithubUrl(event.target.value)}
                    placeholder="https://github.com/user/repo"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-on-surface-variant">GitHub token (optional)</span>
                  <input
                    className="w-full rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                    value={githubToken}
                    onChange={(event) => setGithubToken(event.target.value)}
                    placeholder="ghp_..."
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-on-surface-variant">App name</span>
                  <input
                    className="w-full rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="my-bot"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm text-on-surface-variant">Entry file</span>
                  <input
                    className="w-full rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                    value={entryFile}
                    onChange={(event) => setEntryFile(event.target.value)}
                    placeholder="index.js"
                  />
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex w-full items-center justify-center rounded-md bg-gradient-to-r from-primary-container to-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  {isSubmitting ? 'Deploying...' : 'Clone & Deploy'}
                </button>
              </form>
            )}
          </div>

          <aside className="space-y-6">
            <section className="glass-panel rounded-xl p-5">
              <h2 className="text-sm uppercase tracking-[0.3em] text-on-surface-variant">Status</h2>
              <p className="mt-3 text-sm text-on-surface-variant">{status || 'Waiting for deployment action.'}</p>
              {result ? (
                <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 font-mono text-sm text-on-surface-variant">
                  <div>ID: {result.id}</div>
                  <div>Name: {result.name}</div>
                  <div>Type: {result.type}</div>
                  <div>Directory: {result.directory}</div>
                </div>
              ) : null}
            </section>

            <section className="glass-panel rounded-xl p-5 terminal-panel">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-mono text-sm text-on-surface-variant">Install log</h2>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-on-surface-variant">
                  {isInstalling ? 'Installing' : installComplete ? 'Ready' : 'Idle'}
                </span>
              </div>
              <div ref={terminalRef} className="max-h-80 space-y-2 overflow-y-auto rounded-lg bg-black/50 p-4 font-mono text-xs leading-6 text-emerald-300">
                {terminalLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              <button
                type="button"
                disabled={!installComplete || !result}
                onClick={() => {
                  void startApp();
                }}
                className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-white/10 px-4 py-3 text-sm text-on-surface-variant transition hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Start Bot
              </button>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
