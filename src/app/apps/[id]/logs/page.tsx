"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

export default function LogsPage({ params }: { params: { id: string } }) {
  const appId = params.id;
  const [logs, setLogs] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Loading logs...');
  const terminalRef = useRef<HTMLDivElement | null>(null);

  const filteredLogs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return logs;
    }

    return logs.filter((line) => line.toLowerCase().includes(needle));
  }, [logs, query]);

  useEffect(() => {
    let mounted = true;

    async function loadLogs() {
      try {
        const response = await fetch(`/api/apps/${appId}/logs`);
        if (!response.ok) {
          throw new Error('Failed to load logs');
        }

        const payload = (await response.json()) as string[];
        if (mounted) {
          setLogs(payload);
          setStatus(payload.length > 0 ? 'Live logs connected' : 'No logs yet');
        }
      } catch (error) {
        if (mounted) {
          setStatus(error instanceof Error ? error.message : 'Failed to load logs');
        }
      }
    }

    void loadLogs();

    const source = new EventSource(`/api/apps/${appId}/logs/stream`);
    source.onmessage = (event) => {
      setLogs((current) => [...current, event.data]);
      setStatus('Streaming live logs');
    };
    source.onerror = () => {
      setStatus('Log stream disconnected');
    };

    return () => {
      mounted = false;
      source.close();
    };
  }, [appId]);

  useEffect(() => {
    const element = terminalRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [filteredLogs]);

  function downloadLogs() {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `app-${appId}-logs.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-on-surface md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-on-surface-variant">BluePanel</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">App Logs</h1>
            <p className="mt-2 max-w-2xl text-sm text-on-surface-variant md:text-base">Streaming logs for app #{appId}.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-on-surface-variant">
              {status}
            </span>
            <button
              type="button"
              onClick={downloadLogs}
              className="rounded-md bg-primary-container px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Download logs
            </button>
          </div>
        </header>

        <section className="glass-panel rounded-xl p-5 md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <input
              className="w-full rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search or filter lines..."
            />
          </div>

          <div ref={terminalRef} className="max-h-[70vh] overflow-y-auto rounded-xl bg-black/60 p-4 font-mono text-xs leading-6 text-emerald-300 terminal-panel">
            {filteredLogs.map((line, index) => (
              <div key={`${index}-${line}`}>{line}</div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
