import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { TRANSLATIONS, type Lang } from './translations';

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const k = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      result[k] = value;
    } else if (value && typeof value === 'object') {
      Object.assign(result, flatten(value as Record<string, unknown>, k));
    }
  }
  return result;
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');

  const flat = flatten(TRANSLATIONS[lang] as unknown as Record<string, unknown>);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = flat[key];
      if (text === undefined) {
        text = flatten(TRANSLATIONS['en'] as unknown as Record<string, unknown>)[key] ?? key;
      }
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [flat],
  );

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
