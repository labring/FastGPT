import { useTranslation as useNextTranslation } from 'next-i18next';
import type { I18nNsType } from '../i18n/i18next';
import { I18N_NAMESPACES_MAP } from '../i18n/constants';

export function useTranslation(ns?: I18nNsType[0] | I18nNsType) {
  const { t: originalT, ...rest } = useNextTranslation(ns);

  const t = (key: string | undefined, ...args: any[]): string => {
    if (!key) return '';

    if (!I18N_NAMESPACES_MAP[key as any]) {
      return key;
    }

    // @ts-ignore
    return originalT(key, ...args);
  };

  return {
    t,
    ...rest
  };
}
