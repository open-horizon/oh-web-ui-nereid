// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { en } from './en';
import { zh } from './zh';

type Lang = 'zh' | 'en';

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  fmtTime: (iso?: string) => string;
}

const dicts: Record<Lang, Record<string, string>> = { en, zh };

const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {}, t: (s: string) => s, fmtTime: () => '-' });

function detectLang(): Lang {
  const stored = localStorage.getItem('lang') as Lang | null;
  if (stored) return stored;
  const nav = navigator.language || (navigator as any).userLanguage || '';
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectLang);
  const setLangWithStorage = useCallback((l: Lang) => {
    setLang(l);
    localStorage.setItem('lang', l);
  }, []);
  const t = useCallback((key: string) => {
    const dict = dicts[lang];
    return dict[key] ?? key;
  }, [lang]);
  const fmtTime = useCallback((iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    if (lang === 'en') {
      return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang: setLangWithStorage, t, fmtTime }}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
