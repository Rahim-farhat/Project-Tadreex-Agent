'use client';

import { useEffect, useState } from 'react';
import { adminFetch, errorMessage } from '@/lib/api';
import { useToast } from '@/components/useToast';
import { Icon } from '@/components/Icon';
import styles from './settings.module.css';

interface ModelSettings {
  model: string;
  fastModel: string;
  temperature: number;
  fastTemperature: number;
  apiKey: string;
}

export default function SettingsPage() {
  const [form, setForm] = useState<ModelSettings | null>(null);
  const [saved, setSaved] = useState<ModelSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const { toast, Toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/settings/model');
        if (!res.ok) {
          setLoadError(await errorMessage(res, 'Failed to load settings'));
          return;
        }
        const data: ModelSettings = await res.json();
        setForm(data);
        setSaved(data);
      } catch {
        setLoadError('Cannot reach the server.');
      }
    })();
  }, []);

  const set = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const dirty = !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved);

  const copyApiKey = async () => {
    if (!form?.apiKey) return;
    try {
      await navigator.clipboard.writeText(form.apiKey);
      toast('API key copied to clipboard');
    } catch {
      window.prompt('Copy API key:', form.apiKey);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.model.trim() || !form.fastModel.trim()) {
      toast('Both model names are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch('/api/admin/settings/model', {
        method: 'POST',
        body: JSON.stringify({
          model: form.model.trim(),
          fastModel: form.fastModel.trim(),
          temperature: form.temperature,
          fastTemperature: form.fastTemperature,
          apiKey: form.apiKey.trim(),
        }),
      });
      if (!res.ok) {
        toast(await errorMessage(res, 'Save failed'), 'error');
        return;
      }
      const { settings } = await res.json();
      setForm(settings);
      setSaved(settings);
      toast('Settings saved — API key & models updated');
    } catch {
      toast('Cannot reach the server.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>AI settings</h1>
        <p className={styles.subtitle}>
          Groq API credentials and models used by the scenario assistant. Changes apply immediately to new messages.
        </p>
      </header>

      {loadError ? (
        <div className={styles.errorBox}>{loadError}</div>
      ) : !form ? (
        <div className={styles.card}>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </div>
      ) : (
        <form onSubmit={save} className={styles.card}>
          <section className={styles.group}>
            <div className={styles.groupHead}>
              <h2>Groq API Key</h2>
              <p>Authentication key for Groq. View, copy, or replace it when it expires.</p>
            </div>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>
                  <span>API Key</span>
                  <span className={styles.badgeWrapper}>
                    {form.apiKey ? (
                      <span className={styles.statusBadgeOk}>
                        <Icon name="check" size={12} /> Configured
                      </span>
                    ) : (
                      <span className={styles.statusBadgeWarn}>
                        Not set
                      </span>
                    )}
                  </span>
                </span>
                <div className={styles.inputWithActions}>
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.apiKey || ''}
                    onChange={(e) => set('apiKey', e.target.value)}
                    placeholder="gsk_..."
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <div className={styles.inputActions}>
                    <button
                      type="button"
                      className={styles.iconActionBtn}
                      onClick={() => setShowApiKey(!showApiKey)}
                      title={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      <Icon name={showApiKey ? 'eyeOff' : 'eye'} size={14} />
                      <span style={{ marginLeft: 4 }}>{showApiKey ? 'Hide' : 'Show'}</span>
                    </button>
                    {form.apiKey && (
                      <button
                        type="button"
                        className={styles.iconActionBtn}
                        onClick={copyApiKey}
                        title="Copy API key"
                      >
                        <Icon name="copy" size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <small className={styles.hint}>
                  Changes take effect immediately on all AI completions without server restart.
                </small>
              </label>
            </div>
          </section>

          <section className={styles.group}>
            <div className={styles.groupHead}>
              <h2>Main model</h2>
              <p>Asks the questions, validates answers and writes suggestions.</p>
            </div>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Model ID</span>
                <input
                  value={form.model}
                  onChange={(e) => set('model', e.target.value)}
                  placeholder="openai/gpt-oss-120b"
                  spellCheck={false}
                />
              </label>
              <Temperature value={form.temperature} onChange={(v) => set('temperature', v)} />
            </div>
          </section>

          <section className={styles.group}>
            <div className={styles.groupHead}>
              <h2>Fast model</h2>
              <p>Writes the short acknowledgements between questions.</p>
            </div>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Model ID</span>
                <input
                  value={form.fastModel}
                  onChange={(e) => set('fastModel', e.target.value)}
                  placeholder="openai/gpt-oss-20b"
                  spellCheck={false}
                />
              </label>
              <Temperature value={form.fastTemperature} onChange={(v) => set('fastTemperature', v)} />
            </div>
          </section>

          <div className={styles.actions}>
            {dirty && (
              <button type="button" className={styles.ghostBtn} onClick={() => setForm(saved)} disabled={saving}>
                Discard
              </button>
            )}
            <button type="submit" className={styles.primaryBtn} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
      <Toast />
    </div>
  );
}

function Temperature({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className={styles.field}>
      <span>
        Temperature <output className={styles.tempValue}>{value.toFixed(2)}</output>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={Math.min(value, 1)}
        onChange={(e) => onChange(Number(e.target.value))}
        className={styles.range}
      />
      <small className={styles.hint}>Lower is more consistent, higher is more creative.</small>
    </label>
  );
}
