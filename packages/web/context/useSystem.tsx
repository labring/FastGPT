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
  systemLogo: string;
};

export const useSystemStoreContext = createContext<useSystemContextType>({
  isPc: true,
  systemLogo: ''
});

const SystemStoreContextProvider = ({
  children,
  device,
  systemLogo = ''
}: {
  children: ReactNode;
  device?: 'pc' | 'mobile' | null;
  systemLogo?: string;
}) => {
  const [isPc] = useMediaQuery('(min-width: 900px)', {
    fallback: device === 'pc'
  });
  useEffect(() => {
    setSize(isPc ? 'pc' : 'mobile');
  }, [isPc]);

  const contextValue = useMemo(
    () => ({
      isPc,
      systemLogo
    }),
    [isPc, systemLogo]
  );

  return (
    <useSystemStoreContext.Provider value={contextValue}>{children}</useSystemStoreContext.Provider>
  );
};

export default SystemStoreContextProvider;
