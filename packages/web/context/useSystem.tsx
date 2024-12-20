import React, { ReactNode, useMemo } from 'react';
import { createContext } from 'use-context-selector';
import { useMediaQuery } from '@chakra-ui/react';
import Cookies from 'js-cookie';
import { useEffect } from 'react';

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
  device?: 'pc' | 'mobile';
}) => {
  const [isPc] = useMediaQuery('(min-width: 900px)');

  useEffect(() => {
    setSize(isPc ? 'pc' : 'mobile');
  }, [isPc]);

  const contextValue = useMemo(
    () => ({
      isPc: device ? device === 'pc' : isPc
    }),
    [device, isPc]
  );
  return (
    <useSystemStoreContext.Provider value={contextValue}>{children}</useSystemStoreContext.Provider>
  );
};

export default SystemStoreContextProvider;
