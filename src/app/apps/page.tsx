"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AppRecord } from '@/lib/apps';

function badgeClasses(status: AppRecord['status']) {
  switch (status) {
    case 'running':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    case 'installing':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
    case 'error':
      return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
    default:
      return 'border-white/10 bg-white/5 text-on-surface-variant';
  }
}

function typeLabel(type: AppRecord['type']) {
  return type === 'nodejs' ? 'Node.js' : 'Python';
}

export default function AppsPage() {
  const [apps, setApps] = useState<AppRecord[]>([]);
  const [status, setStatus] = useState('Loading apps...');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function loadApps() {
    try {
      const response = await fetch('/api/apps');
      if (!response.ok) {
        throw new Error('Failed to load apps');
      }

      const payload = (await response.json()) as AppRecord[];
      setApps(payload);
      setStatus(payload.length > 0 ? `${payload.length} app${payload.length === 1 ? '' : 's'} loaded` : 'No apps yet');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load apps');
    }
  }

  useEffect(() => {
    void loadApps();
    const interval = window.setInterval(() => {
      void loadApps();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  async function runAction(id: number, action: 'start' | 'stop' | 'restart' | 'delete') {
    setBusyId(id);
    try {
      const response = await fetch(`/api/apps/${id}${action === 'delete' ? '' : `/${action}`}`, {
        method: action === 'delete' ? 'DELETE' : 'POST'
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || `${action} failed`);
      }

      await loadApps();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${action} failed`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-on-surface md:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-on-surface-variant">BluePanel</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">Applications</h1>
            <p className="mt-2 max-w-2xl text-sm text-on-surface-variant md:text-base">
              Manage deployments, start and stop apps, and monitor logs from one control surface.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-on-surface-variant">
              {status}
            </span>
            <Link
              className="inline-flex w-fit items-center gap-2 rounded-md bg-primary-container px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              href="/apps/new"
            >
              <span>New Deployment</span>
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <article key={app.id} className="glass-panel rounded-xl p-5 shadow-glow">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-on-surface-variant">{typeLabel(app.type)}</p>
                  <h2 className="mt-2 text-xl font-semibold">{app.name}</h2>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium ${badgeClasses(app.status)}`}>
                  {app.status}
                </span>
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-xs text-on-surface-variant">
                <div>Entry: {app.entry_file}</div>
                <div className="mt-1 break-all">Dir: {app.directory}</div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void runAction(app.id, 'start');
                  }}
                  disabled={busyId === app.id || app.status === 'running'}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void runAction(app.id, 'stop');
                  }}
                  disabled={busyId === app.id || app.status === 'stopped'}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void runAction(app.id, 'restart');
                  }}
                  disabled={busyId === app.id}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Restart
                </button>
                <Link
                  href={`/apps/${app.id}/logs`}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm transition hover:bg-white/5"
                >
                  View Logs
                </Link>
                <Link
                  href={`/apps/${app.id}/env`}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm transition hover:bg-white/5"
                >
                  Edit .env
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    void runAction(app.id, 'delete');
                  }}
                  disabled={busyId === app.id}
                  className="rounded-md border border-rose-500/20 px-3 py-2 text-sm text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </article>
          ))}

          <Link
            href="/apps/new"
            className="glass-panel flex min-h-[220px] flex-col items-center justify-center rounded-xl border-dashed border-white/15 p-6 text-center transition hover:border-white/25 hover:bg-white/8"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 text-2xl text-primary">
              +
            </div>
            <h2 className="mt-4 text-xl font-semibold">Deploy New App</h2>
            <p className="mt-2 max-w-xs text-sm text-on-surface-variant">
              Upload a ZIP or connect GitHub to create a new BluePanel deployment.
            </p>
          </Link>
        </section>
      </div>
    </main>
  );
}
