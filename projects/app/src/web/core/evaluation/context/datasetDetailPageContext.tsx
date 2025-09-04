import { type ReactNode } from 'react';
import { createContext } from 'use-context-selector';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';

type DatasetDetailPageContextType = {
  datasetId: string;
  paths: ParentTreePathItemType[];
};

export const DatasetDetailPageContext = createContext<DatasetDetailPageContextType>({
  datasetId: '',
  paths: []
});

export const DatasetDetailPageContextProvider = ({
  children,
  datasetId
}: {
  children: ReactNode;
  datasetId: string;
}) => {
  const contextValue: DatasetDetailPageContextType = {
    datasetId,
    paths: [
      {
        parentId: '',
        parentName: 'Mock 标题待改'
      }
    ]
  };

  return (
    <DatasetDetailPageContext.Provider value={contextValue}>
      {children}
    </DatasetDetailPageContext.Provider>
  );
};
