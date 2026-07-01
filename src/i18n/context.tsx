import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

type Lang = 'zh' | 'en';

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (en: string) => string;
}

const Ctx = createContext<I18nCtx>({ lang: 'en', setLang: () => {}, t: (s: string) => s });

function detectLang(): Lang {
  const stored = localStorage.getItem('lang') as Lang | null;
  if (stored) return stored;
  const nav = navigator.language || (navigator as any).userLanguage || '';
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

export function LanguageProvider({ children, dict }: { children: ReactNode; dict: Record<string, string> }) {
  const [lang, setLang] = useState<Lang>(detectLang);
  const setLangWithStorage = useCallback((l: Lang) => {
    setLang(l);
    localStorage.setItem('lang', l);
  }, []);
  const t = useCallback((en: string) => {
    if (lang === 'zh' && dict[en]) return dict[en];
    return en;
  }, [lang, dict]);
  return <Ctx.Provider value={{ lang, setLang: setLangWithStorage, t }}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
