import { useToast } from '@/hooks/useToast';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import { getErrText } from '@/utils/tools';
import { useTranslation } from 'react-i18next';

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
      errorToast &&
        toast({
          title: t(getErrText(err, errorToast)),
          status: 'error'
        });
    }
  });

  return mutation;
};
