import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ClientI18nErrorFallback from './ClientI18nErrorFallback';
import {
  getClientLanguagePreference,
  getLangMapping,
  getRequiredI18nLanguages,
  persistLanguagePreference
} from './utils';
import { changeLanguageAtomically } from './atomicLanguageChange';
import { I18N_NAMESPACES } from './constants';

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
  const language = getLangMapping(getClientLanguagePreference(storageKey) || defaultLanguage);
  const requiredLanguages = useMemo(() => getRequiredI18nLanguages(language), [language]);
  const ready =
    i18n.language === language &&
    requiredLanguages.every((requiredLanguage) =>
      I18N_NAMESPACES.every((namespace) => i18n.hasResourceBundle(requiredLanguage, namespace))
    );
  const [, setLoadedLanguage] = useState<string>();
  const [loadError, setLoadError] = useState<{ language: string; error: unknown }>();

  useEffect(() => {
    let active = true;

    if (ready) {
      // SSR 已经提供完整资源时无需再次切换，但仍要把首次访问语言提交到权威存储。
      Promise.resolve()
        .then(() => persistLanguagePreference(language, storageKey))
        .catch((error) => {
          if (active) setLoadError({ language, error });
        });
      return;
    }

    changeLanguageAtomically({
      i18n,
      language,
      storageKey
    })
      .then(() => {
        if (!active) return;
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
  }, [i18n, language, ready, requiredLanguages, storageKey]);

  if (loadError?.language === language) {
    return <ClientI18nErrorFallback language={language} error={loadError.error} />;
  }
  if (ready) return children;
  return fallback;
};

export default ClientI18nGate;
