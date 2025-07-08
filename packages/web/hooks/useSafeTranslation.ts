import { useTranslation as useNextTranslation } from 'next-i18next';
import type { I18nNsType } from '../types/i18next';
import { I18N_NAMESPACES } from '../i18n/constant';

export function useTranslation(ns?: I18nNsType[0] | I18nNsType) {
  const { t: originalT, ...rest } = useNextTranslation(ns);

  const t = (key: string | undefined, ...args: any[]): string => {
    if (!key) return '';

    if (key.includes(':')) {
      const namespace = key.split(':')[0];
      if (!I18N_NAMESPACES.includes(namespace as any)) {
        return key;
      }
    }

    // @ts-ignore
    return originalT(key, ...args);
  };

  return {
    t,
    ...rest
  };
}
