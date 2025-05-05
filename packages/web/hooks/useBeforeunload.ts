import { useTranslation } from 'next-i18next';
import { useEffect } from 'react';
import { isProduction } from '@fastgpt/global/common/system/constants';

export const useBeforeunload = (props?: { callback?: () => any; tip?: string }) => {
  const { t } = useTranslation();

  const { tip = t('common:comfirm_leave_page'), callback } = props || {};

  useEffect(() => {
    const listen = isProduction
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
