import { useToast as uToast, type UseToastOptions } from '@chakra-ui/react';
import { type CSSProperties } from 'react';
import { useMemoizedFn } from 'ahooks';
import { useTranslation } from 'next-i18next';

/**
 * 提供全局统一的 Toast 默认行为；调用处显式传入的 duration 优先级最高。
 * 成功提示默认展示 3 秒，错误提示默认展示 5 秒，其他状态保持 2 秒。
 * 返回的 toast 引用保持稳定，调用时读取最新翻译和配置，避免触发调用方 effect 重跑。
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

  const myToast = useMemoizedFn((options?: UseToastOptions) => {
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
  });

  return {
    toast: myToast
  };
};
