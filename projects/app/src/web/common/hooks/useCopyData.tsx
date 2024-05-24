import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useCallback } from 'react';

/**
 * copy text data
 */
export const useCopyData = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const copyData = useCallback(
    async (data: string, title: string | null = t('common.Copy Successful'), duration = 1000) => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data);
        } else {
          throw new Error('');
        }
      } catch (error) {
        console.log(error);

        const textarea = document.createElement('textarea');
        textarea.value = data;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body?.removeChild(textarea);
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
