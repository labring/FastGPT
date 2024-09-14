import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCallback } from 'react';
import { hasHttps } from '@fastgpt/web/common/system/utils';
import { isProduction } from '@fastgpt/service/common/system/constants';

/**
 * copy text data
 */
export const useCopyData = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const copyData = useCallback(
    async (
      data: string,
      title: string | null = t('common:common.Copy Successful'),
      duration = 1000
    ) => {
      data = data.trim();

      try {
        if ((hasHttps() || !isProduction) && navigator.clipboard) {
          await navigator.clipboard.writeText(data);
        } else {
          throw new Error('');
        }
      } catch (error) {
        // console.log(error);

        const textarea = document.createElement('textarea');
        textarea.value = data;
        textarea.style.position = 'absolute';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);

        textarea.select();
        const res = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (!res) {
          return toast({
            title: t('common:common.Copy_failed'),
            status: 'error',
            duration
          });
        }
      }

      if (title) {
        toast({
          title,
          status: 'success',
          duration
        });
      }
    },
    [t, toast]
  );

  return {
    copyData
  };
};
