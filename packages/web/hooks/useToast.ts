import { useToast as uToast, UseToastOptions } from '@chakra-ui/react';
import { useCallback, useMemo } from 'react';

export const useToast = (props?: UseToastOptions) => {
  const toast = uToast({
    position: 'top',
    duration: 2000,
    ...props
  });

  const myToast = useCallback(
    (options?: UseToastOptions) => {
      toast(options);
    },
    [props]
  );

  return {
    toast: myToast
  };
};
