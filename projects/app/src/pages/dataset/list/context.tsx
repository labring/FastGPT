import {
  getDatasetPaths,
  putDatasetById,
  getDatasets,
  getDatasetById,
  delDatasetById
} from '@/web/core/dataset/api';
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
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetItemType } from '@fastgpt/global/core/dataset/type';
import { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import { useTranslation } from 'react-i18next';

const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

export type DatasetContextType = {
  refetchDatasets: () => void;
  refetchPaths: () => void;
  refetchFolderDetail: () => void;
  isFetchingDatasets: boolean;
  setMoveDatasetId: (id: string) => void;
  paths: ParentTreePathItemType[];
  folderDetail?: DatasetItemType;
  editedDataset?: EditResourceInfoFormType;
  setEditedDataset: (data?: EditResourceInfoFormType) => void;
  onDelDataset: (id: string) => Promise<void>;
};

export const DatasetsContext = createContext<DatasetContextType>({
  refetchDatasets: () => {},
  isFetchingDatasets: false,
  setMoveDatasetId: () => {},
  refetchPaths: () => {},
  paths: [],
  refetchFolderDetail: () => {},
  folderDetail: {} as any,
  editedDataset: {} as any,
  setEditedDataset: () => {},
  onDelDataset: () => Promise.resolve()
});

function DatasetContextProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { commonT } = useI18n();
  const { t } = useTranslation();

  const { parentId = null } = router.query as { parentId?: string | null };
  const { myDatasets, loadMyDatasets } = useDatasetStore();

  const { data: folderDetail, runAsync: refetchFolderDetail } = useRequest2(
    () => (parentId ? getDatasetById(parentId) : Promise.resolve(undefined)),
    {
      manual: false,
      refreshDeps: [parentId, myDatasets]
    }
  );
  const getDatasetFolderList = useCallback(({ parentId }: GetResourceFolderListProps) => {
    return getDatasets({
      parentId,
      type: DatasetTypeEnum.folder
    }).then((res) => {
      return res.map((item) => ({
        id: item._id,
        name: item.name
      }));
    });
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

  const [editedDataset, setEditedDataset] = useState<EditResourceInfoFormType>();

  const { runAsync: onDelDataset } = useRequest2(delDatasetById, {
    successToast: t('common.Delete Success'),
    errorToast: t('dataset.Delete Dataset Error')
  });

  const contextValue = {
    refetchDatasets,
    isFetchingDatasets,
    setMoveDatasetId,
    paths,
    refetchPaths,
    refetchFolderDetail,
    folderDetail,
    editedDataset,
    setEditedDataset,
    onDelDataset
  };

  return (
    <DatasetsContext.Provider value={contextValue}>
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
    </DatasetsContext.Provider>
  );
}

export default DatasetContextProvider;
