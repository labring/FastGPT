import { useTranslation } from 'next-i18next';
import { useEffect } from 'react';

export const useBeforeunload = (props?: { callback?: () => any; tip?: string }) => {
  const { t } = useTranslation();

  const { tip = t('common:common.Confirm to leave the page'), callback } = props || {};

  useEffect(() => {
    const listen =
      process.env.NODE_ENV === 'production'
        ? (e: any) => {
            e.preventDefault();
            e.returnValue = tip;
            callback?.();
          }
        : () => {
            callback?.();
          };
    window.addEventListener('beforeunload', listen);

    return () => {
      window.removeEventListener('beforeunload', listen);
    };
  }, [tip, callback]);
};
