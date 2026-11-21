import {
  getToolIdentityKey,
  getToolReferenceKeyCandidates,
  isSourcedToolReferenceKey
} from '@fastgpt/global/core/app/tool/utils';

export type SkillReferenceIdentity = {
  id: string;
  pluginId?: string;
};

/** 只有唯一命中才认领，多个同键工具时绝不跨来源猜测。 */
const getUniqueMatch = <T>(matches: T[]): T | undefined =>
  matches.length === 1 ? matches[0] : undefined;

/** 缺省 source 的裸 id 代表系统版，统一规范为 `system:<id>` 身份键。 */
const getSkillIdentityKey = (skill: SkillReferenceIdentity) =>
  isSourcedToolReferenceKey(skill.id) ? skill.id : getToolIdentityKey(skill.id, undefined);

/**
 * 引用键解析规则：
 * - 带来源的引用只在同一身份命名空间内精确匹配 / 候选匹配，不会命中其他来源或无来源工具；
 * - 裸键把缺省 source 的裸 id 视为 `system:<id>`，与团队版等带来源工具共同参与唯一性判断，
 *   同 ID 多来源时返回 undefined，绝不跨来源猜测。
 */
export const findSkillByReferenceKey = <T extends SkillReferenceIdentity>(
  skills: T[],
  referenceKey: string
): T | undefined => {
  const key = typeof referenceKey === 'string' ? referenceKey.trim() : '';
  if (!key) return undefined;

  if (isSourcedToolReferenceKey(key)) {
    const exactMatch = skills.find((skill) => skill.id === key);
    if (exactMatch) return exactMatch;

    for (const candidate of getToolReferenceKeyCandidates(key)) {
      const matched = getUniqueMatch(skills.filter((skill) => skill.id === candidate));
      if (matched) return matched;
      // 同一候选命中多个工具时视为歧义，不再继续向其他键兜底。
      if (skills.some((skill) => skill.id === candidate)) return undefined;
    }

    return undefined;
  }

  // 裸键：系统版（裸 id 或缺省 source）与团队版等带来源工具共同参与唯一性判断。
  const matches = new Set<T>();
  const systemIdentityKey = getToolIdentityKey(key, undefined);
  const suffix = `:${key}`;
  skills.forEach((skill) => {
    if (
      getSkillIdentityKey(skill) === systemIdentityKey ||
      skill.pluginId === key ||
      skill.id.endsWith(suffix) ||
      skill.pluginId?.endsWith(suffix)
    ) {
      matches.add(skill);
    }
  });

  for (const candidate of getToolReferenceKeyCandidates(key)) {
    const candidateMatches = skills.filter((skill) => skill.id === candidate);
    if (candidateMatches.length > 1) return undefined;
    candidateMatches.forEach((skill) => matches.add(skill));
  }

  return getUniqueMatch([...matches]);
};
