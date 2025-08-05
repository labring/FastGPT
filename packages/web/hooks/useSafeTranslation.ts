import { useTranslation as useNextTranslation } from 'next-i18next';
import { I18N_NAMESPACES_MAP } from '../i18n/constants';

export function useSafeTranslation() {
  const { t: originalT, ...rest } = useNextTranslation();

  const t = (key: string | undefined, ...args: any[]): string => {
    if (!key) return '';

    const ns = key.split(':')[0];
    if (!I18N_NAMESPACES_MAP[ns as any]) {
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
