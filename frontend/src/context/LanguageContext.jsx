import { createContext, useContext, useState, useEffect } from 'react';
import th from '../i18n/th';
import en from '../i18n/en';

const translations = { th, en };
const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('smartfarm_lang') || 'th';
  });

  useEffect(() => {
    localStorage.setItem('smartfarm_lang', lang);
  }, [lang]);

  const t = translations[lang] || translations.th;

  const toggleLang = () => {
    setLang((prev) => (prev === 'th' ? 'en' : 'th'));
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
