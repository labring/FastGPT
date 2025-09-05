import { type ReactNode } from 'react';
import { createContext } from 'use-context-selector';

export const DatasetDetailPageContext = createContext({});

const DatasetDetailPageContextProvider = ({ children }: { children: ReactNode }) => {
  const contextValue = {};

  return (
    <DatasetDetailPageContext.Provider value={contextValue}>
      {children}
    </DatasetDetailPageContext.Provider>
  );
};
export default DatasetDetailPageContextProvider;
