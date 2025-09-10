import { type ReactNode } from 'react';
import { createContext } from 'use-context-selector';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';

type DatasetDetailPageContextType = {
  paths: ParentTreePathItemType[];
  collectionId: string;
};

export const DatasetDetailPageContext = createContext<DatasetDetailPageContextType>({
  paths: [],
  collectionId: ''
});

export const DatasetDetailPageContextProvider = ({
  children,
  collectionId,
  collectionName
}: {
  children: ReactNode;
  collectionId: string;
  collectionName: string;
}) => {
  const contextValue: DatasetDetailPageContextType = {
    collectionId,
    paths: [
      {
        parentId: '',
        parentName: collectionName
      }
    ]
  };

  return (
    <DatasetDetailPageContext.Provider value={contextValue}>
      {children}
    </DatasetDetailPageContext.Provider>
  );
};
