import { useTranslation } from 'next-i18next';
import { useEffect, useState, type ReactNode } from 'react';
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
  const [ready, setReady] = useState(
    () => i18n.language === language && i18n.hasResourceBundle(language, BASE_NAMESPACE)
  );

  useEffect(() => {
    let active = true;

    if (i18n.language === language && i18n.hasResourceBundle(language, BASE_NAMESPACE)) {
      setLangToStorage(language, storageKey);
      setReady(true);
      return;
    }

    setReady(false);

    i18n
      .loadNamespaces(BASE_NAMESPACE)
      .then(() => i18n.changeLanguage(language))
      .then(() => {
        if (!active) return;
        setLangToStorage(language, storageKey);
        setReady(true);
      })
      .catch(() => {
        if (active) setReady(false);
      });

    return () => {
      active = false;
    };
  }, [i18n, language, storageKey]);

  return ready ? children : fallback;
};

export default ClientI18nGate;
