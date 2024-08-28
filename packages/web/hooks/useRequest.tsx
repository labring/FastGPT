import { useToast } from './useToast';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useTranslation } from 'next-i18next';
import { useRequest as ahooksUseRequest } from 'ahooks';

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
        const errText = t(getErrText(err, errorToast || '') as any);
        if (errText) {
          toast({
            title: errText,
            status: 'error'
          });
        }
      }
    }
  });

  return mutation;
};

type UseRequestFunProps<TData, TParams extends any[]> = Parameters<
  typeof ahooksUseRequest<TData, TParams>
>;
export const useRequest2 = <TData, TParams extends any[]>(
  server: UseRequestFunProps<TData, TParams>[0],
  options: UseRequestFunProps<TData, TParams>[1] & {
    errorToast?: string;
    successToast?: string;
  } = {},
  plugin?: UseRequestFunProps<TData, TParams>[2]
) => {
  const { t } = useTranslation();
  const { errorToast = 'Error', successToast, ...rest } = options || {};
  const { toast } = useToast();

  const res = ahooksUseRequest<TData, TParams>(
    server,
    {
      manual: true,
      ...rest,
      onError: (err, params) => {
        rest?.onError?.(err, params);
        if (errorToast !== undefined) {
          const errText = t(getErrText(err, errorToast || '') as any);
          if (errText) {
            toast({
              title: errText,
              status: 'error'
            });
          }
        }
      },
      onSuccess: (res, params) => {
        rest?.onSuccess?.(res, params);
        if (successToast) {
          toast({
            title: successToast,
            status: 'success'
          });
        }
      }
    },
    plugin
  );

  return res;
};
