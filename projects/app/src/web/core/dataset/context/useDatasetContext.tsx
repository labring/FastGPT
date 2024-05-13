import { ReactNode } from 'react';
import { createContext } from 'use-context-selector';

type DatasetContextType = {};

type DatasetContextValueType = {};

export const DatasetContext = createContext<DatasetContextType>({});

export const DatasetContextProvider = ({
  children,
  value
}: {
  children: ReactNode;
  value: DatasetContextValueType;
}) => {
  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
};
