import { ReactNode } from 'react';
import { createContext } from 'use-context-selector';

type ContextType = {};

export const Context = createContext<ContextType>({});

export const ContextProvider = ({ children }: { children: ReactNode }) => {
  const contextValue: ContextType = {};
  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};
