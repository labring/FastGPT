import { getDatasetPaths, putDatasetById } from '@/web/core/dataset/api';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import {
  GetResourceFolderListProps,
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { useRouter } from 'next/router';
import React, { useCallback, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useI18n } from '@/web/context/I18n';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { DatasetUpdateBody } from '@fastgpt/global/core/dataset/api';
import dynamic from 'next/dynamic';

const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

export type DatasetContextType = {
  refetchDatasets: () => void;
  refetchPaths: () => void;
  isFetchingDatasets: boolean;
  setMoveDatasetId: (id: string) => void;
  paths: ParentTreePathItemType[];
};

export const DatasetContext = createContext<DatasetContextType>({
  refetchDatasets: () => {},
  isFetchingDatasets: false,
  setMoveDatasetId: () => {},
  refetchPaths: () => {},
  paths: []
});

function DatasetContextProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { commonT } = useI18n();

  const { parentId = null } = router.query as { parentId?: string | null };
  const { loadMyDatasets } = useDatasetStore();

  const getDatasetFolderList = useCallback(async ({ parentId }: GetResourceFolderListProps) => {
    const res = await getDatasetPaths(parentId);
    return res.map((item) => ({
      id: item.parentId,
      name: item.parentName
    }));
  }, []);

  const { data: paths = [], runAsync: refetchPaths } = useRequest2(
    () => getDatasetPaths(parentId),
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { runAsync: refetchDatasets, loading: isFetchingDatasets } = useRequest2(
    () => loadMyDatasets(parentId ?? undefined),
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const [moveDatasetId, setMoveDatasetId] = useState<string>();

  const { runAsync: onUpdateDataset } = useRequest2((data: DatasetUpdateBody) =>
    putDatasetById(data).then(async (res) => {
      await Promise.all([refetchDatasets(), refetchPaths()]);
      return res;
    })
  );

  const onMoveDataset = useCallback(
    async (parentId: ParentIdType) => {
      if (!moveDatasetId) return;
      await onUpdateDataset({
        id: moveDatasetId,
        parentId
      });
    },
    [moveDatasetId, onUpdateDataset]
  );

  const contextValue = {
    refetchDatasets,
    isFetchingDatasets,
    setMoveDatasetId,
    paths,
    refetchPaths
  };

  return (
    <DatasetContext.Provider value={contextValue}>
      {children}
      {!!moveDatasetId && (
        <MoveModal
          moveResourceId={moveDatasetId}
          server={getDatasetFolderList}
          title={commonT('Move')}
          onClose={() => setMoveDatasetId(undefined)}
          onConfirm={onMoveDataset}
        />
      )}
    </DatasetContext.Provider>
  );
}

export default DatasetContextProvider;
