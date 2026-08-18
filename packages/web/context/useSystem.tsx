import React, { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useMediaQuery } from '@chakra-ui/react';

type useSystemContextType = {
  isPc: boolean;
  isSystemSizeReady: boolean;
};

export const useSystemStoreContext = createContext<useSystemContextType>({
  isPc: true,
  isSystemSizeReady: false
});

const SystemStoreContextProvider = ({
  children,
  waitForReady = false,
  fallback
}: {
  children: ReactNode;
  waitForReady?: boolean;
  fallback?: ReactNode;
}) => {
  const [isPc] = useMediaQuery('(min-width: 900px)', { fallback: true });
  const [isSystemSizeReady, setIsSystemSizeReady] = useState(false);

  useEffect(() => {
    setIsSystemSizeReady(true);
  }, [isPc]);

  const contextValue = useMemo(
    () => ({
      isPc,
      isSystemSizeReady
    }),
    [isPc, isSystemSizeReady]
  );

  if (waitForReady && !isSystemSizeReady) return fallback ?? null;

  return (
    <useSystemStoreContext.Provider value={contextValue}>{children}</useSystemStoreContext.Provider>
  );
};

export default SystemStoreContextProvider;
