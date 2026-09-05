import { useToast as uToast, type UseToastOptions } from '@chakra-ui/react';
import { type CSSProperties, useCallback } from 'react';
import { useTranslation } from 'next-i18next';

/**
 * 提供全局统一的 Toast 默认行为；调用处显式传入的 duration 优先级最高。
 * 成功提示默认展示 3 秒，错误提示默认展示 5 秒，其他状态保持 2 秒。
 */
export const useToast = (props?: UseToastOptions & { containerStyle?: CSSProperties }) => {
  const { containerStyle, ...toastProps } = props || {};
  const { t } = useTranslation();

  const toast = uToast({
    position: 'top',
    duration: 2000,
    containerStyle: {
      fontSize: 'sm',
      ...containerStyle
    },
    ...toastProps
  });

  const myToast = useCallback(
    (options?: UseToastOptions) => {
      if (options?.title || options?.description) {
        const status = options.status ?? toastProps.status;
        const duration =
          options.duration ??
          toastProps.duration ??
          (status === 'error' ? 5000 : status === 'success' ? 3000 : 2000);

        toast({
          ...(options.title && { title: t(options.title as any) }),
          ...(options.description && { description: t(options.description as any) }),
          ...options,
          duration
        });
      }
    },
    [t, toast, toastProps.duration, toastProps.status]
  );

  return {
    toast: myToast
  };
};
