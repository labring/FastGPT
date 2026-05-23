import { useCallback, useMemo, useState } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSkillList } from '@/web/core/skill/api';
import type { ListSkillsResponse } from '@fastgpt/global/core/ai/skill/api';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

export type SkillSelectItemType = ListSkillsResponse['list'][number];
export type SkillSelectNavItemType = { id: string; name: string };

/**
 * 维护 Skill 选择弹窗的数据源。
 *
 * 只有弹窗打开时才拉取列表；搜索和进入文件夹属于用户主动切换列表范围，
 * 会在弹窗打开期间刷新当前列表。
 */
export const useSkillSelectData = () => {
  const [searchKey, setSearchKey] = useState('');
  const [navStack, setNavStack] = useState<SkillSelectNavItemType[]>([]);

  const parentId = navStack.length > 0 ? navStack[navStack.length - 1].id : '';

  const { data: skillList = [], loading: isLoadingSkillList } = useRequest(
    async () => {
      const { list } = await getSkillList({
        source: 'mine',
        parentId,
        searchKey: searchKey || undefined
      });
      return list;
    },
    {
      manual: false,
      refreshDeps: [parentId, searchKey],
      throttleWait: 300
    }
  );

  const onEnterFolder = useCallback((item: SkillSelectItemType) => {
    setNavStack((prev) => [...prev, { id: item._id, name: item.name }]);
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

  const reset = useCallback(() => {
    setSearchKey('');
    setNavStack([]);
  }, []);

  return {
    skillList,
    isLoadingSkillList,
    searchKey,
    setSearchKey,
    paths,
    onEnterFolder,
    onUpdateParentId,
    reset
  };
};
