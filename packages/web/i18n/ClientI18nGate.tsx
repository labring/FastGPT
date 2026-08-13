import { useTranslation } from 'next-i18next';
import { useEffect, useState, type ReactNode } from 'react';
import ClientI18nErrorFallback from './ClientI18nErrorFallback';
import { getLangMapping, getPersistedLang, setLangToStorage } from './utils';

const BASE_NAMESPACE = 'common';

type ClientI18nGateProps = {
  defaultLanguage: string;
  storageKey: string;
  fallback: ReactNode;
  children: ReactNode;
};

const ClientI18nGate = ({
  defaultLanguage,
  storageKey,
  fallback,
  children
}: ClientI18nGateProps) => {
  const { i18n } = useTranslation();
  const language = getLangMapping(
    getPersistedLang(storageKey) ||
      (typeof navigator === 'undefined' ? undefined : navigator.language) ||
      defaultLanguage
  );
  const ready = i18n.language === language && i18n.hasResourceBundle(language, BASE_NAMESPACE);
  const [, setLoadedLanguage] = useState<string>();
  const [loadError, setLoadError] = useState<{ language: string; error: unknown }>();

  useEffect(() => {
    let active = true;

    if (ready) {
      setLangToStorage(language, storageKey);
      return;
    }

    i18n
      .loadNamespaces(BASE_NAMESPACE)
      .then(() => i18n.changeLanguage(language))
      .then(() => {
        if (!active) return;
        setLangToStorage(language, storageKey);
        // changeLanguage 通常会触发重渲染；额外记录完成语言以兼容未派发事件的实现。
        setLoadedLanguage(language);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError({ language, error });
      });

    return () => {
      active = false;
    };
  }, [i18n, language, ready, storageKey]);

  if (ready) return children;
  if (loadError?.language === language) {
    return <ClientI18nErrorFallback language={language} error={loadError.error} />;
  }
  return fallback;
};

export default ClientI18nGate;
