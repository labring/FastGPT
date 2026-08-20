import React, { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useScrollPagination, type ScrollListType } from '@fastgpt/web/hooks/useScrollPagination';
import { getSkillList, getSkillFolderPath, getSkillDetail } from '@/web/core/skill/api';
import type { ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { normalizeParentId } from '@fastgpt/global/common/parentFolder/depth';
import { useRouter } from 'next/router';
import type { SkillPermission } from '@fastgpt/global/support/permission/skill/controller';

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
  ScrollData: ScrollListType;
  searchKey: string;
  setSearchKey: Dispatch<SetStateAction<string>>;
  parentId: string | null;
  paths: ParentTreePathItemType[];
  folderDetail?: {
    permission: SkillPermission;
  };
};

export const SkillListContext = createContext<SkillListContextType>({
  skills: [],
  isFetchingSkills: false,
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
  folderDetail: undefined
});

const SkillListContextProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const parentId = normalizeParentId(router.query.parentId);

  const [searchKey, setSearchKey] = useState('');

  const {
    data: skills = [],
    isLoading: isFetchingSkills,
    ScrollData,
    fetchData
  } = useScrollPagination(
    ({ offset = 0, pageSize = 50 }) =>
      getSkillList({
        source: 'mine',
        searchKey,
        parentId,
        page: Number(offset) / Number(pageSize) + 1,
        pageSize
      }).then((res) => ({
        list: res.list.map((item) => ({
          ...item,
          createTime: new Date(item.createTime),
          updateTime: new Date(item.updateTime)
        })),
        total: res.total
      })),
    {
      pageSize: 50,
      refreshDeps: [searchKey, parentId],
      throttleWait: 500,
      refreshOnWindowFocus: false
    }
  );
  const refreshSkills = () => fetchData({ init: true });

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
    skills,
    isFetchingSkills,
    refreshSkills,
    ScrollData,
    searchKey,
    setSearchKey,
    parentId,
    paths,
    folderDetail
  };

  return <SkillListContext.Provider value={contextValue}>{children}</SkillListContext.Provider>;
};

export default SkillListContextProvider;
