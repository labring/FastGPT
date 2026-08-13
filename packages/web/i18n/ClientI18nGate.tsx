import { useTranslation } from 'next-i18next';
import { useEffect, useState, type ReactNode } from 'react';
import ClientI18nErrorFallback from './ClientI18nErrorFallback';
import { getLangMapping, getPersistedLang, setLangToStorage } from './utils';
import { ClientI18nLoadError } from './ClientI18nLoadError';

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

    let failedError: unknown;
    const onFailedLoading = (failedLanguage: string, namespace: string, error: unknown) => {
      if (failedLanguage === language && namespace === BASE_NAMESPACE) failedError = error;
    };
    i18n.on('failedLoading', onFailedLoading);

    i18n
      .changeLanguage(language)
      .then(() => {
        if (failedError || i18n.language !== language) {
          throw new ClientI18nLoadError({
            language,
            namespace: BASE_NAMESPACE,
            cause: failedError ?? new Error('Language change failed')
          });
        }
        if (!i18n.hasResourceBundle(language, BASE_NAMESPACE)) {
          throw new ClientI18nLoadError({
            language,
            namespace: BASE_NAMESPACE,
            cause: new Error('Resource bundle was not registered')
          });
        }
      })
      .then(() => {
        if (!active) return;
        setLangToStorage(language, storageKey);
        // changeLanguage 通常会触发重渲染；额外记录完成语言以兼容未派发事件的实现。
        setLoadedLanguage(language);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError({ language, error });
      })
      .finally(() => {
        i18n.off('failedLoading', onFailedLoading);
      });

    return () => {
      active = false;
      i18n.off('failedLoading', onFailedLoading);
    };
  }, [i18n, language, ready, storageKey]);

  if (ready) return children;
  if (loadError?.language === language) {
    return <ClientI18nErrorFallback language={language} error={loadError.error} />;
  }
  return fallback;
};

export default ClientI18nGate;
