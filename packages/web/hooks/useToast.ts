import { useToast as uToast, UseToastOptions } from '@chakra-ui/react';
import { CSSProperties, useCallback } from 'react';
import { useTranslation } from 'next-i18next';

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
        toast({
          ...(options.title && { title: t(options.title as any) }),
          ...(options.description && { description: t(options.description as any) }),
          ...options
        });
      }
    },
    [props]
  );

  return {
    toast: myToast
  };
};
