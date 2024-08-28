import { useToast as uToast, UseToastOptions } from '@chakra-ui/react';
import { useCallback, useMemo } from 'react';

export const useToast = (props?: UseToastOptions) => {
  const toast = uToast({
    position: 'top',
    duration: 2000,
    containerStyle: {
      fontSize: 'sm'
    },
    ...props
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
