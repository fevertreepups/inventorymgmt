import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppConfig } from './types';
import { getMeta, setMeta } from './db/db';

interface ConfigCtx {
  config: AppConfig;
  reload: () => Promise<void>;
  save: (c: AppConfig) => Promise<void>;
}

const Ctx = createContext<ConfigCtx | null>(null);

function applyTheme(c: AppConfig) {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', c.theme.primary);
  root.style.setProperty('--brand-accent', c.theme.accent);
}

async function loadConfig(): Promise<AppConfig> {
  const stored = await getMeta('config');
  if (stored) return JSON.parse(stored) as AppConfig;
  const res = await fetch('/config.json');
  return (await res.json()) as AppConfig;
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);

  const reload = async () => {
    const c = await loadConfig();
    applyTheme(c);
    setConfig(c);
  };

  useEffect(() => {
    reload();
  }, []);

  const save = async (c: AppConfig) => {
    await setMeta('config', JSON.stringify(c));
    applyTheme(c);
    setConfig({ ...c });
  };

  if (!config) {
    return <div className="p-8 text-gray-400">Loading…</div>;
  }

  return <Ctx.Provider value={{ config, reload, save }}>{children}</Ctx.Provider>;
}

export function useConfig(): ConfigCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useConfig must be used within ConfigProvider');
  return c;
}

/** Convenience: vocabulary accessor. */
export function useVocab() {
  return useConfig().config.vocabulary;
}
