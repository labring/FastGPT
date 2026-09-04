import React, {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useState
} from 'react';
import { createContext } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSkillList, getSkillFolderPath, getSkillDetail } from '@/web/core/skill/api';
import type { ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
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
  refreshSkills: () => void;
  searchKey: string;
  setSearchKey: Dispatch<SetStateAction<string>>;
  parentId: string | null;
  paths: ParentTreePathItemType[];
  folderDetail?: {
    permission: SkillPermission;
  };
  listFilters: ResourceListFilterType;
  setListFilters: (next: ResourceListFilterType) => void;
};

export const SkillListContext = createContext<SkillListContextType>({
  skills: [],
  isFetchingSkills: false,
  refreshSkills: () => {
    throw new Error('Function not implemented.');
  },
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
  }
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

  const {
    data,
    refresh: refreshSkills,
    loading: isFetchingSkills
  } = useRequest(
    () =>
      getSkillList({
        source: 'mine',
        searchKey,
        parentId,
        ...(applyToolbarFilters ? { sort: listFilters.sort } : {}),
        ...(tmbIds !== undefined ? { tmbIds } : {})
      }).then((res) =>
        res.list.map((item) => ({
          ...item,
          createTime: new Date(item.createTime),
          updateTime: new Date(item.updateTime)
        }))
      ),
    {
      manual: false,
      refreshDeps: [
        searchKey,
        parentId,
        applyToolbarFilters ? listFilters.sort : '',
        tmbIds === undefined ? 'none' : tmbIds.join(','),
        feConfigs.isPlus,
        isPc
      ],
      throttleWait: 500,
      refreshOnWindowFocus: false
    }
  );

  // 加载面包屑路径（仅在文件夹内时请求）
  const { data: paths = [] } = useRequest(
    () => {
      if (!parentId) return Promise.resolve([]);
      return getSkillFolderPath({ sourceId: parentId, type: 'current' });
    },
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { data: folderDetail } = useRequest(
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

  const contextValue: SkillListContextType = {
    skills: data || [],
    isFetchingSkills,
    refreshSkills,
    searchKey,
    setSearchKey,
    parentId,
    paths,
    folderDetail,
    listFilters,
    setListFilters
  };

  return <SkillListContext.Provider value={contextValue}>{children}</SkillListContext.Provider>;
};

export default SkillListContextProvider;
