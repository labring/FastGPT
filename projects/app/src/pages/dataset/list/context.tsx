import { getDatasetPaths } from '@/web/core/dataset/api';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import React from 'react';
import { createContext } from 'use-context-selector';

export type DatasetContextType = {
  refetch: () => void;
  isFetching: boolean;
  paths: ParentTreePathItemType[];
};

export const DatasetContext = createContext<DatasetContextType>({
  refetch: () => {},
  isFetching: false,
  paths: []
});

function DatasetContextProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { parentId } = router.query as { parentId: string };
  const { loadMyDatasets } = useDatasetStore();

  const { data, refetch, isFetching } = useQuery(
    ['loadDataset', parentId],
    () => {
      return Promise.all([loadMyDatasets(parentId), getDatasetPaths(parentId)]);
    },
    {
      onError(err) {
        toast({
          status: 'error',
          title: t(getErrText(err))
        });
      }
    }
  );

  const paths = data?.[1] || [];

  const contextValue = {
    refetch,
    isFetching,
    paths
  };

  return <DatasetContext.Provider value={contextValue}>{children}</DatasetContext.Provider>;
}

export default DatasetContextProvider;
