"use client";

import { useState } from 'react';

type Row = {
  key: string;
  value: string;
  visible: boolean;
};

export default function EnvEditorPage({ params }: { params: { id: string } }) {
  const appId = params.id;
  const [rows, setRows] = useState<Row[]>([{ key: '', value: '', visible: false }]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  function updateRow(index: number, field: keyof Omit<Row, 'visible'>, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  }

  function addRow() {
    setRows((current) => [...current, { key: '', value: '', visible: false }]);
  }

  function toggleValue(index: number) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, visible: !row.visible } : row))
    );
  }

  async function saveEnv() {
    setSaving(true);
    setStatus('Saving environment variables...');

    try {
      const vars = rows.reduce<Record<string, string>>((accumulator, row) => {
        if (row.key.trim()) {
          accumulator[row.key.trim()] = row.value;
        }
        return accumulator;
      }, {});

      const response = await fetch(`/api/apps/${appId}/env`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vars })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || 'Failed to save environment variables');
      }

      const restart = await fetch(`/api/apps/${appId}/restart`, { method: 'POST' });
      if (!restart.ok) {
        const payload = (await restart.json()) as { error?: string };
        throw new Error(payload.error || 'Environment saved, but restart failed');
      }

      setStatus('Environment saved and app restarted.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save environment variables');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-on-surface md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header>
          <p className="text-xs uppercase tracking-[0.3em] text-on-surface-variant">BluePanel</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">Environment Variables</h1>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant md:text-base">
            Edit <span className="font-mono">.env</span> values for app #{appId} and restart the app after saving.
          </p>
        </header>

        <section className="glass-panel rounded-xl p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <span className="text-sm text-on-surface-variant">KEY / VALUE rows</span>
            <button type="button" onClick={addRow} className="text-sm text-primary hover:underline">
              Add row
            </button>
          </div>

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={`${index}-${row.key}`} className="grid gap-2 md:grid-cols-[1fr_1.5fr_auto] md:items-center">
                <input
                  className="rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                  value={row.key}
                  onChange={(event) => updateRow(index, 'key', event.target.value)}
                  placeholder="KEY"
                />
                <input
                  className="rounded-md border border-white/10 bg-background px-4 py-3 outline-none transition focus:border-primary-container"
                  value={row.value}
                  onChange={(event) => updateRow(index, 'value', event.target.value)}
                  placeholder="VALUE"
                  type={row.visible ? 'text' : 'password'}
                />
                <button
                  type="button"
                  onClick={() => toggleValue(index)}
                  className="rounded-md border border-white/10 px-4 py-3 text-sm transition hover:bg-white/5"
                >
                  {row.visible ? 'Hide' : 'Show'}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-on-surface-variant">{status}</p>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void saveEnv();
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary-container px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
