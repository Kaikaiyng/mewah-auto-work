import React, { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { Language } from '../types';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (en: string, bmOrZh?: string, zh?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('maw_preferred_language');
      return saved === 'bm' || saved === 'zh' || saved === 'en' ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    try {
      localStorage.setItem('maw_preferred_language', nextLanguage);
    } catch {
      // Language still changes for the current session when storage is unavailable.
    }
  }, []);

  const t = (en: string, bmOrZh?: string, zh?: string) => {
    if (language === 'en') return en;
    if (language === 'bm') return zh ? (bmOrZh || en) : en;
    return zh || bmOrZh || en;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
