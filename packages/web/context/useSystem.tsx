import React, { type ReactNode, useMemo, useEffect } from 'react';
import { createContext } from 'use-context-selector';
import { useMediaQuery } from '@chakra-ui/react';
import Cookies from 'js-cookie';

const CookieKey = 'NEXT_DEVICE_SIZE';
const setSize = (value: string) => {
  Cookies.set(CookieKey, value, { expires: 30 });
  localStorage.setItem(CookieKey, value);
};

type useSystemContextType = {
  isPc: boolean;
};

export const useSystemStoreContext = createContext<useSystemContextType>({
  isPc: true
});

const SystemStoreContextProvider = ({
  children,
  device
}: {
  children: ReactNode;
  device?: 'pc' | 'mobile' | null;
}) => {
  const [isPc] = useMediaQuery('(min-width: 900px)', {
    fallback: device === 'pc'
  });
  useEffect(() => {
    setSize(isPc ? 'pc' : 'mobile');
  }, [isPc]);

  const contextValue = useMemo(
    () => ({
      isPc
    }),
    [isPc]
  );

  return (
    <useSystemStoreContext.Provider value={contextValue}>{children}</useSystemStoreContext.Provider>
  );
};

export default SystemStoreContextProvider;
