import { useMemo } from 'react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getSkillList } from '@/web/core/skill/api';

export type SelectedAgentSkillStatus = Record<string, boolean>;

/**
 * 批量校验 Agent 已关联 Skill 是否仍可读。
 *
 * Agent 表单只保存 skillId/name 等快照；Skill 被软删除或权限被移除后，快照仍会留在应用配置中。
 * 这里按 skillId 批量查询当前可见 Skill，并把缺失项标记为 deleted，供编辑页显式提示但不自动修改配置。
 */
export const useSelectedAgentSkillStatus = (selectedSkills: SelectedAgentSkillItemType[]) => {
  const skillIds = useMemo(
    () => Array.from(new Set(selectedSkills.map((item) => item.skillId).filter(Boolean))),
    [selectedSkills]
  );
  const skillIdsKey = useMemo(() => skillIds.join(','), [skillIds]);

  const { data: visibleSkillIds } = useRequest(
    async () => {
      if (skillIds.length === 0) return new Set<string>();

      const { list } = await getSkillList({
        skillIds,
        withAppCount: false
      });
      return new Set(list.map((item) => item._id));
    },
    {
      manual: false,
      refreshDeps: [skillIdsKey],
      errorToast: ''
    }
  );

  return useMemo<SelectedAgentSkillStatus>(() => {
    if (!visibleSkillIds) return {};

    return skillIds.reduce<SelectedAgentSkillStatus>((acc, skillId) => {
      acc[skillId] = !visibleSkillIds.has(skillId);
      return acc;
    }, {});
  }, [skillIds, visibleSkillIds]);
};
