import { useToast as uToast, UseToastOptions } from '@chakra-ui/react';
import { CSSProperties, useCallback } from 'react';

export const useToast = (props?: UseToastOptions & { containerStyle?: CSSProperties }) => {
  const { containerStyle, ...toastProps } = props || {};

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
        toast(options);
      }
    },
    [props]
  );

  return {
    toast: myToast
  };
};
