import { useToast as uToast, UseToastOptions } from '@chakra-ui/react';
import { useCallback, useMemo } from 'react';

export const useToast = (props?: UseToastOptions) => {
  const toast = useCallback(
    (options?: UseToastOptions) =>
      uToast({
        position: 'top',
        duration: 2000,
        ...props
      })(options),
    [props]
  );

  return {
    toast
  };
};
