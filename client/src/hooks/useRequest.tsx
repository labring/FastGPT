import { useToast } from '@/hooks/useToast';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';

interface Props extends UseMutationOptions<any, any, any, any> {
  successToast?: string;
  errorToast?: string;
}

export const useRequest = ({ successToast, errorToast, onSuccess, onError, ...props }: Props) => {
  const { toast } = useToast();
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
          title: typeof err === 'string' ? err : err?.message || errorToast,
          status: 'error'
        });
    }
  });

  return mutation;
};
