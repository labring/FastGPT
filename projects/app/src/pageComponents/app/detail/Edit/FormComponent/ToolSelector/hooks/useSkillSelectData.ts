import { useCallback, useMemo, useState } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSkillList } from '@/web/core/skill/api';
import type { ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

export type SkillSelectItemType = ListSkillsResponse['list'][number];
export type SkillSelectNavItemType = { id: string; name: string; hasWritePer: boolean };

/**
 * 维护 Skill 选择弹窗的数据源。
 *
 * 只有弹窗打开时才拉取列表；搜索和进入文件夹属于用户主动切换列表范围，
 * 会在弹窗打开期间刷新当前列表。
 */
export const useSkillSelectData = () => {
  const [searchKey, setSearchKey] = useState('');
  const [navStack, setNavStack] = useState<SkillSelectNavItemType[]>([]);

  // fetchParentId 与 parentId 根目录语义不同，故分别维护：
  // - fetchParentId（根目录为 ''）是 getSkillList 的入参约定；
  // - parentId（根目录为 null，ParentIdType）是文件夹模型 / 创建·导入弹窗的入参约定。
  const fetchParentId = navStack.length > 0 ? navStack[navStack.length - 1].id : '';
  const parentId: ParentIdType = fetchParentId || null;
  // 当前所在文件夹的写权限（根目录为 null，由调用方回退到团队级创建权限）。
  const currentFolderHasWritePer =
    navStack.length > 0 ? navStack[navStack.length - 1].hasWritePer : null;

  const {
    data: skillList = [],
    loading: isLoadingSkillList,
    refreshAsync: refreshSkillList
  } = useRequest(
    async () => {
      const { list } = await getSkillList({
        source: 'mine',
        parentId: fetchParentId,
        searchKey: searchKey || undefined,
        withAppCount: false
      });
      return list;
    },
    {
      manual: false,
      refreshDeps: [fetchParentId, searchKey],
      throttleWait: 300
    }
  );

  const onEnterFolder = useCallback((item: SkillSelectItemType) => {
    setNavStack((prev) => [
      ...prev,
      { id: item._id, name: item.name, hasWritePer: item.permission.hasWritePer }
    ]);
    setSearchKey('');
  }, []);

  const paths = useMemo(
    () => navStack.map((item) => ({ parentId: item.id, parentName: item.name })),
    [navStack]
  );

  const onUpdateParentId = useCallback((targetParentId: ParentIdType) => {
    if (!targetParentId) {
      setNavStack([]);
    } else {
      setNavStack((prev) => {
        const idx = prev.findIndex((item) => item.id === targetParentId);
        return idx >= 0 ? prev.slice(0, idx + 1) : prev;
      });
    }
    setSearchKey('');
  }, []);

  return {
    skillList,
    isLoadingSkillList,
    searchKey,
    setSearchKey,
    paths,
    parentId,
    currentFolderHasWritePer,
    refreshSkillList,
    onEnterFolder,
    onUpdateParentId
  };
};
