import React, { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSkillList, getSkillFolderPath } from '@/web/core/skill/api';
import type { ListSkillsResponse } from '@fastgpt/global/core/agentSkills/api';
import type { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useRouter } from 'next/router';
import { SkillPermission } from '@fastgpt/global/support/permission/agentSkill/controller';

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
  loadSkills: () => Promise<any>;
  searchKey: string;
  setSearchKey: Dispatch<SetStateAction<string>>;
  parentId: string | null;
  paths: ParentTreePathItemType[];
};

export const SkillListContext = createContext<SkillListContextType>({
  skills: [],
  isFetchingSkills: false,
  loadSkills: async () => {
    throw new Error('Function not implemented.');
  },
  searchKey: '',
  setSearchKey: () => {
    throw new Error('Function not implemented.');
  },
  parentId: null,
  paths: []
});

const SkillListContextProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  // 归一化 parentId：非空字符串时取值，否则为 null
  const rawParentId = router.query.parentId;
  const parentId: string | null =
    typeof rawParentId === 'string' && rawParentId.length > 0 ? rawParentId : null;

  const [searchKey, setSearchKey] = useState('');

  const {
    data,
    runAsync: loadSkills,
    loading: isFetchingSkills
  } = useRequest(
    () =>
      getSkillList({ source: 'mine', searchKey: searchKey, parentId: parentId ?? '' }).then((res) =>
        res.list.map((item) => ({
          ...item,
          createTime: new Date(item.createTime),
          updateTime: new Date(item.updateTime),
          permission: new SkillPermission({ role: item.permission ?? 0 })
        }))
      ),
    {
      manual: false,
      refreshDeps: [searchKey, parentId],
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

  const contextValue: SkillListContextType = {
    skills: data || [],
    isFetchingSkills,
    loadSkills,
    searchKey,
    setSearchKey,
    parentId,
    paths
  };

  return <SkillListContext.Provider value={contextValue}>{children}</SkillListContext.Provider>;
};

export default SkillListContextProvider;
