'use client';
import {
  getDatasetPaths,
  putDatasetById,
  batchMoveDatasets,
  getDatasetsV2,
  getDatasetById,
  delDatasetById
} from '@/web/core/dataset/api';
import {
  type ParentIdType,
  type ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import type { SelectOneResourceServer } from '@/components/common/folder/SelectOneResource';
import { normalizeParentId } from '@fastgpt/global/common/parentFolder/depth';
import { useRouter } from 'next/router';
import React, { useCallback, useMemo, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination, type ScrollListType } from '@fastgpt/web/hooks/useScrollPagination';
import { type UpdateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import dynamic from 'next/dynamic';
import BatchActionBar from '@/components/common/batch/BatchActionBar';
import BatchDeleteModal from './BatchDeleteModal';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { type DatasetItemType, type DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { type EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import { useTranslation } from 'next-i18next';
import { usePersistedFilters } from '@fastgpt/web/hooks/usePersistedFilters';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { buildFilterStorageKey } from '@/web/common/filter/storageKey';
import {
  AppListFiltersStoreSchema,
  defaultAppListFiltersStore,
  toListTmbIds,
  type DatasetListFilterType
} from '@/pageComponents/dashboard/agent/filters/utils';
import { useResponsiveGridPageSize } from '@fastgpt/web/hooks/useResponsiveGridPageSize';

const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

export type DatasetContextType = {
  myDatasets: DatasetListItemType[];
  loadMyDatasets: (options?: { silent?: boolean; resourceId?: string }) => Promise<void>;
  refetchPaths: () => void;
  refetchFolderDetail: () => Promise<DatasetItemType | undefined>;
  isFetchingDatasets: boolean;
  isEmpty: boolean;
  ScrollData: ScrollListType;
  setMoveDatasetId: (id: string) => void;
  paths: ParentTreePathItemType[];
  folderDetail?: DatasetItemType;
  editedDataset?: EditResourceInfoFormType;
  setEditedDataset: (data?: EditResourceInfoFormType) => void;
  onDelDataset: (id: string) => Promise<void>;
  onUpdateDataset: (data: UpdateDatasetBody) => Promise<void>;
  searchKey: string;
  setSearchKey: React.Dispatch<React.SetStateAction<string>>;
  listFilters: DatasetListFilterType;
  setListFilters: (next: DatasetListFilterType) => void;
  columnCount: number;
  pageSize: number;

  isBatchMode: boolean;
  setIsBatchMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  selectedDatasetIds: string[];
  setSelectedDatasetIds: React.Dispatch<React.SetStateAction<string[]>>;
  onToggleSelectDataset: (id: string) => void;
  onSelectAllDatasets: (checked: boolean) => void;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  selectableDatasets: DatasetListItemType[];
  selectedDatasets: DatasetListItemType[];
  isBatchMoving: boolean;
  setIsBatchMoving: (val: boolean) => void;
  isBatchDeleting: boolean;
  setIsBatchDeleting: (val: boolean) => void;
};

export const DatasetsContext = createContext<DatasetContextType>({
  isFetchingDatasets: false,
  isEmpty: false,
  ScrollData: () => <></>,
  setMoveDatasetId: () => {},
  refetchPaths: () => {},
  paths: [],
  folderDetail: {} as any,
  editedDataset: {} as any,
  setEditedDataset: () => {},
  onDelDataset: () => Promise.resolve(),
  loadMyDatasets: function (): Promise<void> {
    throw new Error('Function not implemented.');
  },
  refetchFolderDetail: function (): Promise<DatasetItemType | undefined> {
    throw new Error('Function not implemented.');
  },
  onUpdateDataset: function (_data: UpdateDatasetBody): Promise<void> {
    throw new Error('Function not implemented.');
  },
  myDatasets: [],
  searchKey: '',
  setSearchKey: function (_value: React.SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  listFilters: defaultAppListFiltersStore.dataset,
  setListFilters: () => {
    throw new Error('Function not implemented.');
  },
  columnCount: 1,
  pageSize: 20,

  isBatchMode: false,
  setIsBatchMode: () => {},
  selectedDatasetIds: [],
  setSelectedDatasetIds: () => {},
  onToggleSelectDataset: () => {},
  onSelectAllDatasets: () => {},
  isAllSelected: false,
  isIndeterminate: false,
  selectableDatasets: [],
  selectedDatasets: [],
  isBatchMoving: false,
  setIsBatchMoving: () => {},
  isBatchDeleting: false,
  setIsBatchDeleting: () => {}
});

function DatasetContextProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [moveDatasetId, setMoveDatasetId] = useState<string>();
  const [searchKey, setSearchKey] = useState('');
  const parentId = normalizeParentId(router.query.parentId);
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();
  const filterKey = userInfo?.team.teamId
    ? buildFilterStorageKey({ teamId: userInfo.team.teamId })
    : '';
  const [filterStore, setFilterStore] = usePersistedFilters({
    key: filterKey,
    schema: AppListFiltersStoreSchema,
    defaultValue: defaultAppListFiltersStore
  });
  const listFilters = filterStore.dataset;
  const setListFilters = useCallback(
    (next: DatasetListFilterType) => setFilterStore((prev) => ({ ...prev, dataset: next })),
    [setFilterStore]
  );
  const applyToolbarFilters = isPc;
  const tmbIds =
    applyToolbarFilters && feConfigs.isPlus ? toListTmbIds(listFilters.creator) : undefined;
  const listType =
    applyToolbarFilters && listFilters.type !== 'all'
      ? [DatasetTypeEnum.folder, listFilters.type]
      : undefined;
  const { columnCount, pageSize } = useResponsiveGridPageSize(
    parentId ? { base: 1, sm: 2, md: 2, lg: 3 } : { base: 1, sm: 2, md: 3, lg: 3, xl: 4 }
  );
  const listParams = {
    searchKey,
    withAppCount: true,
    withFileCount: true,
    ...(listType ? { type: listType } : {}),
    ...(applyToolbarFilters ? { sort: listFilters.sort } : {}),
    ...(tmbIds !== undefined ? { tmbIds } : {})
  };

  const {
    data: myDatasets = [],
    fetchData,
    refreshItems,
    ScrollData,
    isLoading: isFetchingDatasets,
    isEmpty
  } = useScrollPagination(
    ({ offset = 0, pageSize = 20 }, cancelToken) =>
      getDatasetsV2({ ...listParams, parentId, offset, pageSize }, cancelToken),
    {
      refreshByIds: {
        getId: (item) => item._id,
        api: (datasetIds, cancelToken) =>
          getDatasetsV2({ ...listParams, datasetIds }, cancelToken).then(({ list }) => list)
      },
      refreshDeps: [
        parentId,
        searchKey,
        listType?.join(',') ?? 'all',
        applyToolbarFilters ? listFilters.sort : '',
        tmbIds === undefined ? 'none' : tmbIds.join(','),
        feConfigs.isPlus,
        isPc
      ],
      pageSize,
      throttleWait: 300,
      refreshOnWindowFocus: false,
      showPaginationTip: false
    }
  );
  /** 列表卡片（含文件夹）按 ID 同步；侧栏权限变更等未指定 ID 的刷新从首屏重新分页。 */
  const loadMyDatasets = useCallback(
    ({ silent = false, resourceId }: { silent?: boolean; resourceId?: string } = {}) => {
      if (resourceId) return refreshItems([resourceId]);
      return fetchData({ init: true, silent });
    },
    [fetchData, refreshItems]
  );

  const { data: paths = [], runAsync: refetchPaths } = useRequest(
    async () => {
      if (!parentId) return [];
      return getDatasetPaths({ sourceId: parentId, type: 'current' });
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );
  const currentFolderPath = paths.find(({ parentId: pathId }) => pathId === parentId);

  const {
    data: requestedFolderDetail,
    error: folderDetailError,
    loading: isLoadingFolderDetail,
    runAsync: refetchFolderDetail
  } = useRequest(() => (parentId ? getDatasetById(parentId) : Promise.resolve(undefined)), {
    manual: false,
    ready: !parentId || currentFolderPath?.folderAccessMode === 'read',
    refreshDeps: [parentId, currentFolderPath?.folderAccessMode]
  });
  // 仅真实可读目录请求详情；导航目录只展示路径和子资源，不请求无权读取的目录详情。
  const folderDetail = (() => {
    if (!parentId || currentFolderPath?.folderAccessMode === 'navigate') return undefined;
    if (
      currentFolderPath?.folderAccessMode !== 'read' ||
      isLoadingFolderDetail ||
      folderDetailError ||
      requestedFolderDetail?._id !== parentId
    ) {
      return undefined;
    }
    return requestedFolderDetail;
  })();

  const { runAsync: onUpdateDataset } = useRequest(putDatasetById, {
    onSuccess: () => Promise.all([refetchFolderDetail(), refetchPaths(), loadMyDatasets()])
  });

  const onMoveDataset = useCallback(
    async (parentId: ParentIdType) => {
      if (!moveDatasetId) return;
      const result = await batchMoveDatasets({
        ids: [moveDatasetId],
        parentId: parentId ?? null
      });
      await loadMyDatasets();
      return result;
    },
    [moveDatasetId, loadMyDatasets]
  );

  const getDatasetFolderList = useCallback<SelectOneResourceServer>(
    ({ parentId, offset, pageSize }, cancelToken) =>
      getDatasetsV2(
        {
          parentId,
          type: DatasetTypeEnum.folder,
          withAppCount: false,
          offset,
          pageSize
        },
        cancelToken
      ).then(({ list, total }) => ({
        total,
        list: list.map((item) => ({
          id: item._id,
          name: item.name,
          avatar: FolderImgUrl,
          isFolder: true,
          disabled: !item.permission.hasManagePer
        }))
      })),
    []
  );

  const [editedDataset, setEditedDataset] = useState<EditResourceInfoFormType>();

  const { runAsync: onDelDataset } = useRequest(delDatasetById, {
    successToast: t('common:delete_success'),
    errorToast: t('common:dataset.Delete Dataset Error')
  });

  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
  const [isBatchMoving, setIsBatchMoving] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  // 在渲染阶段同步校准状态：当离开批量模式，或目录、搜索、筛选发生变化时立即清空已选项
  const [prevBatchState, setPrevBatchState] = useState({
    parentId,
    searchKey,
    listFilters,
    isBatchMode
  });

  if (
    prevBatchState.parentId !== parentId ||
    prevBatchState.searchKey !== searchKey ||
    prevBatchState.listFilters !== listFilters ||
    prevBatchState.isBatchMode !== isBatchMode
  ) {
    setPrevBatchState({
      parentId,
      searchKey,
      listFilters,
      isBatchMode
    });
    if (selectedDatasetIds.length > 0) {
      setSelectedDatasetIds([]);
    }
  }

  const handleSetIsBatchMode = useCallback((action: React.SetStateAction<boolean>) => {
    setIsBatchMode((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (!next) {
        setSelectedDatasetIds([]);
      }
      return next;
    });
  }, []);

  // 可批量操作的资源（必须具有管理权限或为 Owner）
  const selectableDatasets = useMemo(
    () =>
      myDatasets.filter((dataset) =>
        Boolean(dataset.permission?.hasManagePer || dataset.permission?.isOwner)
      ),
    [myDatasets]
  );
  const selectableDatasetIds = useMemo(
    () => selectableDatasets.map((d) => d._id),
    [selectableDatasets]
  );

  const selectedDatasets = useMemo(
    () => myDatasets.filter((dataset) => selectedDatasetIds.includes(dataset._id)),
    [myDatasets, selectedDatasetIds]
  );

  const isAllSelected = useMemo(
    () =>
      selectableDatasetIds.length > 0 &&
      selectableDatasetIds.every((id) => selectedDatasetIds.includes(id)),
    [selectableDatasetIds, selectedDatasetIds]
  );

  const isIndeterminate = useMemo(
    () => selectedDatasetIds.length > 0 && !isAllSelected,
    [selectedDatasetIds, isAllSelected]
  );

  const onToggleSelectDataset = useCallback(
    (id: string) => {
      if (!selectableDatasetIds.includes(id)) return;
      setSelectedDatasetIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    },
    [selectableDatasetIds]
  );

  const onSelectAllDatasets = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedDatasetIds(selectableDatasetIds);
      } else {
        setSelectedDatasetIds([]);
      }
    },
    [selectableDatasetIds]
  );

  const onBatchMoveDatasets = useCallback(
    async (targetParentId: ParentIdType) => {
      if (selectedDatasetIds.length === 0) return;
      const finalParentId = targetParentId === 'root' ? null : (targetParentId as string);
      const result = await batchMoveDatasets({
        ids: selectedDatasetIds,
        parentId: finalParentId
      });
      await loadMyDatasets();
      setSelectedDatasetIds(result.failedIds);
      if (result.failedIds.length === 0) setIsBatchMode(false);
      return result;
    },
    [selectedDatasetIds, loadMyDatasets]
  );

  const contextValue = {
    isFetchingDatasets,
    isEmpty,
    ScrollData,
    setMoveDatasetId,
    paths,
    refetchPaths,
    refetchFolderDetail,
    folderDetail,
    editedDataset,
    setEditedDataset,
    onDelDataset,
    onUpdateDataset,
    myDatasets,
    loadMyDatasets,
    searchKey,
    setSearchKey,
    listFilters,
    setListFilters,
    columnCount,
    pageSize,

    isBatchMode,
    setIsBatchMode: handleSetIsBatchMode,
    selectedDatasetIds,
    setSelectedDatasetIds,
    onToggleSelectDataset,
    onSelectAllDatasets,
    isAllSelected,
    isIndeterminate,
    selectableDatasets,
    selectedDatasets,
    isBatchMoving,
    setIsBatchMoving,
    isBatchDeleting,
    setIsBatchDeleting
  };

  return (
    <DatasetsContext.Provider value={contextValue}>
      {children}
      {isBatchMode && isPc && (
        <BatchActionBar
          isAllSelected={isAllSelected}
          isIndeterminate={isIndeterminate}
          selectedCount={selectedDatasetIds.length}
          onSelectAll={onSelectAllDatasets}
          onBatchMove={() => setIsBatchMoving(true)}
          onBatchDelete={() => setIsBatchDeleting(true)}
        />
      )}
      {!!moveDatasetId && (
        <MoveModal
          moveResourceId={moveDatasetId}
          server={getDatasetFolderList}
          title={t('common:Move')}
          onClose={() => setMoveDatasetId(undefined)}
          onConfirm={(parentId) => onMoveDataset(parentId)}
          moveHint={t('dataset:move.hint')}
        />
      )}
      {isBatchMoving && (
        <MoveModal
          moveResourceIds={selectedDatasetIds}
          server={getDatasetFolderList}
          title={t('common:Move')}
          onClose={() => setIsBatchMoving(false)}
          onConfirm={onBatchMoveDatasets}
          moveHint={t('dataset:move.hint')}
        />
      )}
      {isBatchDeleting && selectedDatasets.length > 0 && (
        <BatchDeleteModal
          datasets={selectedDatasets}
          onClose={() => setIsBatchDeleting(false)}
          onSuccess={({ failedIds }) => {
            setSelectedDatasetIds(failedIds);
            if (failedIds.length === 0) setIsBatchMode(false);
            loadMyDatasets();
          }}
        />
      )}
    </DatasetsContext.Provider>
  );
}

export default DatasetContextProvider;
