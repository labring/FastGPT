import { useToast } from '@fastgpt/web/hooks/useToast';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';

interface Props extends UseMutationOptions<any, any, any, any> {
  successToast?: string | null;
  errorToast?: string | null;
}

export const useRequest = ({ successToast, errorToast, onSuccess, onError, ...props }: Props) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const mutation = useMutation<unknown, unknown, any, unknown>({
    ...props,
    onSuccess(res, variables: void, context: unknown) {
      onSuccess?.(res, variables, context);
      successToast &&
        toast({
          title: successToast,
          status: 'success'
        });
    },
    onError(err: any, variables: void, context: unknown) {
      onError?.(err, variables, context);

      if (errorToast !== undefined) {
        const errText = getErrText(err, errorToast || '');
        // 如果errText是一个国际化键（以'error.'开头），则进行翻译
        const translatedText = errText.startsWith('error.')
          ? t(`common:${errText}` as any)
          : errText;
        if (translatedText) {
          toast({
            title: translatedText,
            status: 'error'
          });
        }
      }
    }
  });

  return mutation;
};
