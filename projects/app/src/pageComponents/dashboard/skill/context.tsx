import React, {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useMemo,
  useState
} from 'react';
import { createContext } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination, type ScrollListType } from '@fastgpt/web/hooks/useScrollPagination';
import {
  getSkillListV2,
  getSkillFolderPath,
  getSkillDetail,
  batchMoveSkills
} from '@/web/core/skill/api';
import type { ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import type {
  ParentIdType,
  ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { normalizeParentId } from '@fastgpt/global/common/parentFolder/depth';
import { useRouter } from 'next/router';
import type { SkillPermission } from '@fastgpt/global/support/permission/skill/controller';
import { usePersistedFilters } from '@fastgpt/web/hooks/usePersistedFilters';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { buildFilterStorageKey } from '@/web/common/filter/storageKey';
import {
  AppListFiltersStoreSchema,
  defaultAppListFiltersStore,
  toListTmbIds,
  type ResourceListFilterType
} from '@/pageComponents/dashboard/agent/filters/utils';
import {
  getGridRequestPageSize,
  useResponsiveGridPageSize
} from '@fastgpt/web/hooks/useResponsiveGridPageSize';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import type { SelectOneResourceServer } from '@/components/common/folder/SelectOneResource';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import BatchActionBar from '@/components/common/batch/BatchActionBar';
import BatchDeleteModal from './BatchDeleteModal';

const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));

export type SkillListItemType = Omit<
  ListSkillsResponse['list'][number],
  'createTime' | 'updateTime' | 'permission'
> & {
  createTime: Date;
  updateTime: Date;
  permission: SkillPermission;
};

type SkillListContextType = {
  skills: SkillListItemType[];
  isFetchingSkills: boolean;
  isEmpty: boolean;
  refreshSkills: () => void;
  ScrollData: ScrollListType;
  searchKey: string;
  setSearchKey: Dispatch<SetStateAction<string>>;
  parentId: string | null;
  paths: ParentTreePathItemType[];
  folderDetail?: {
    permission: SkillPermission;
  };
  listFilters: ResourceListFilterType;
  setListFilters: (next: ResourceListFilterType) => void;
  columnCount: number;
  pageSize: number;

  isBatchMode: boolean;
  setIsBatchMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  selectedSkillIds: string[];
  setSelectedSkillIds: React.Dispatch<React.SetStateAction<string[]>>;
  onToggleSelectSkill: (id: string) => void;
  onSelectAllSkills: (checked: boolean) => void;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  selectableSkills: SkillListItemType[];
  selectedSkills: SkillListItemType[];
  isBatchMoving: boolean;
  setIsBatchMoving: (val: boolean) => void;
  isBatchDeleting: boolean;
  setIsBatchDeleting: (val: boolean) => void;
  getSkillFolderList: SelectOneResourceServer;
};

export const SkillListContext = createContext<SkillListContextType>({
  skills: [],
  isFetchingSkills: false,
  isEmpty: false,
  refreshSkills: () => {
    throw new Error('Function not implemented.');
  },
  ScrollData: () => <></>,
  searchKey: '',
  setSearchKey: () => {
    throw new Error('Function not implemented.');
  },
  parentId: null,
  paths: [],
  folderDetail: undefined,
  listFilters: defaultAppListFiltersStore.skill,
  setListFilters: () => {
    throw new Error('Function not implemented.');
  },
  columnCount: 1,
  pageSize: 50,

  isBatchMode: false,
  setIsBatchMode: () => {},
  selectedSkillIds: [],
  setSelectedSkillIds: () => {},
  onToggleSelectSkill: () => {},
  onSelectAllSkills: () => {},
  isAllSelected: false,
  isIndeterminate: false,
  selectableSkills: [],
  selectedSkills: [],
  isBatchMoving: false,
  setIsBatchMoving: () => {},
  isBatchDeleting: false,
  setIsBatchDeleting: () => {},
  getSkillFolderList: () => Promise.resolve({ list: [], total: 0 })
});

const SkillListContextProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const parentId = normalizeParentId(router.query.parentId);

  const [searchKey, setSearchKey] = useState('');
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
  const listFilters = filterStore.skill;
  const setListFilters = useCallback(
    (next: ResourceListFilterType) => setFilterStore((prev) => ({ ...prev, skill: next })),
    [setFilterStore]
  );
  const applyToolbarFilters = isPc;
  const tmbIds =
    applyToolbarFilters && feConfigs.isPlus ? toListTmbIds(listFilters.creator) : undefined;
  const { columnCount, pageSize } = useResponsiveGridPageSize(
    parentId ? { base: 1, sm: 2, md: 2, lg: 3 } : { base: 1, sm: 2, md: 2, lg: 3, xl: 4 }
  );

  const {
    data: skills = [],
    isLoading: isFetchingSkills,
    isEmpty,
    ScrollData,
    fetchData
  } = useScrollPagination(
    ({ offset = 0, pageSize = 50 }) =>
      getSkillListV2({
        source: 'mine',
        searchKey,
        parentId,
        offset,
        pageSize: getGridRequestPageSize(pageSize, offset),
        ...(applyToolbarFilters ? { sort: listFilters.sort } : {}),
        ...(tmbIds !== undefined ? { tmbIds } : {})
      }).then((res) => ({
        list: res.list.map((item) => ({
          ...item,
          createTime: new Date(item.createTime),
          updateTime: new Date(item.updateTime)
        })),
        total: res.total
      })),
    {
      refreshDeps: [
        searchKey,
        parentId,
        applyToolbarFilters ? listFilters.sort : '',
        tmbIds === undefined ? 'none' : tmbIds.join(','),
        feConfigs.isPlus,
        isPc
      ],
      pageSize,
      showPaginationTip: false,
      throttleWait: 500,
      refreshOnWindowFocus: false
    }
  );
  const refreshSkills = useCallback(() => fetchData({ init: true }), [fetchData]);

  // 加载面包屑路径（仅在文件夹内时请求）
  const { data: paths = [], run: refetchPaths } = useRequest(
    () => {
      if (!parentId) return Promise.resolve([]);
      return getSkillFolderPath({ sourceId: parentId, type: 'current' });
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { data: folderDetail, run: refetchFolderDetail } = useRequest(
    () => {
      if (!parentId) return Promise.resolve(undefined);
      return getSkillDetail({ skillId: parentId }).then((res) => ({
        permission: res.permission
      }));
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { t } = useTranslation();
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
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
    if (selectedSkillIds.length > 0) {
      setSelectedSkillIds([]);
    }
  }

  const handleSetIsBatchMode = useCallback((action: React.SetStateAction<boolean>) => {
    setIsBatchMode((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      if (!next) {
        setSelectedSkillIds([]);
      }
      return next;
    });
  }, []);

  // 可批量操作的资源（必须具有管理权限或为 Owner）
  const selectableSkills = useMemo(
    () =>
      skills.filter((skill) =>
        Boolean(skill.permission?.hasManagePer || skill.permission?.isOwner)
      ),
    [skills]
  );
  const selectableSkillIds = useMemo(() => selectableSkills.map((s) => s._id), [selectableSkills]);

  const selectedSkills = useMemo(
    () => skills.filter((skill) => selectedSkillIds.includes(skill._id)),
    [skills, selectedSkillIds]
  );

  const isAllSelected = useMemo(
    () =>
      selectableSkillIds.length > 0 &&
      selectableSkillIds.every((id) => selectedSkillIds.includes(id)),
    [selectableSkillIds, selectedSkillIds]
  );

  const isIndeterminate = useMemo(
    () => selectedSkillIds.length > 0 && !isAllSelected,
    [selectedSkillIds, isAllSelected]
  );

  const onToggleSelectSkill = useCallback(
    (id: string) => {
      if (!selectableSkillIds.includes(id)) return;
      setSelectedSkillIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    },
    [selectableSkillIds]
  );

  const onSelectAllSkills = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedSkillIds(selectableSkillIds);
      } else {
        setSelectedSkillIds([]);
      }
    },
    [selectableSkillIds]
  );

  const onBatchMoveSkills = useCallback(
    async (targetParentId: ParentIdType) => {
      if (selectedSkillIds.length === 0) return;
      const finalParentId = targetParentId === 'root' ? null : (targetParentId as string);
      const result = await batchMoveSkills({
        ids: selectedSkillIds,
        parentId: finalParentId
      });
      await Promise.all([refetchFolderDetail(), refetchPaths(), refreshSkills()]);
      setSelectedSkillIds(result.failedIds);
      if (result.failedIds.length === 0) setIsBatchMode(false);
      return result;
    },
    [selectedSkillIds, refetchFolderDetail, refetchPaths, refreshSkills]
  );

  const getSkillFolderList = useCallback<SelectOneResourceServer>(
    ({ parentId, offset, pageSize }, cancelToken) =>
      getSkillListV2(
        {
          source: 'mine',
          type: AgentSkillTypeEnum.folder,
          parentId,
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

  const contextValue: SkillListContextType = {
    skills,
    isFetchingSkills,
    isEmpty,
    refreshSkills,
    ScrollData,
    searchKey,
    setSearchKey,
    parentId,
    paths,
    folderDetail,
    listFilters,
    setListFilters,
    columnCount,
    pageSize,

    isBatchMode,
    setIsBatchMode: handleSetIsBatchMode,
    selectedSkillIds,
    setSelectedSkillIds,
    onToggleSelectSkill,
    onSelectAllSkills,
    isAllSelected,
    isIndeterminate,
    selectableSkills,
    selectedSkills,
    isBatchMoving,
    setIsBatchMoving,
    isBatchDeleting,
    setIsBatchDeleting,
    getSkillFolderList
  };

  return (
    <SkillListContext.Provider value={contextValue}>
      {children}
      {isBatchMode && isPc && (
        <BatchActionBar
          isAllSelected={isAllSelected}
          isIndeterminate={isIndeterminate}
          selectedCount={selectedSkillIds.length}
          onSelectAll={onSelectAllSkills}
          onBatchMove={() => setIsBatchMoving(true)}
          onBatchDelete={() => setIsBatchDeleting(true)}
        />
      )}
      {isBatchMoving && (
        <MoveModal
          moveResourceIds={selectedSkillIds}
          server={getSkillFolderList}
          title={t('skill:move_skill')}
          onClose={() => setIsBatchMoving(false)}
          onConfirm={onBatchMoveSkills}
          moveHint={t('skill:move_skill_hint')}
        />
      )}
      {isBatchDeleting && selectedSkills.length > 0 && (
        <BatchDeleteModal
          skills={selectedSkills}
          onClose={() => setIsBatchDeleting(false)}
          onSuccess={({ failedIds }) => {
            setSelectedSkillIds(failedIds);
            if (failedIds.length === 0) setIsBatchMode(false);
            refreshSkills();
          }}
        />
      )}
    </SkillListContext.Provider>
  );
};

export default SkillListContextProvider;
