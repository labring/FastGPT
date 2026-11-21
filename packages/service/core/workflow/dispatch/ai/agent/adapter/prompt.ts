import {
  createToolReferenceRegExp,
  getToolReferenceKeyCandidates,
  normalizeToolReferenceBraces
} from '@fastgpt/global/core/app/tool/utils';

const toolReferenceReg = createToolReferenceRegExp();

export type PromptToolReferenceInfoType = {
  id: string;
  /** 旧版裸 ID；生产端（getAgentRuntimeTools）恒写，用于裸引用唯一性判定。 */
  legacyId: string;
  name: string;
};

export type PromptToolReferenceInfoMapResult = {
  /** 身份键与全局唯一旧版裸 ID 的查找表。 */
  referenceInfoMap: Map<string, string>;
  /** 同一裸 ID 对应多个父级身份键时，这些裸 ID 视为歧义，不得再回退派生候选。 */
  ambiguousLegacyIds: Set<string>;
};

/**
 * 构建提示词工具引用的查找表。
 *
 * 第一遍登记每个工具的身份键（`<source>:<id>`），保证同 ID 不同来源的工具各自保留结果；
 * 第二遍只登记全局唯一的旧版裸 ID，避免历史引用在同 ID 多来源时被错误替换成某一个来源的名称。
 *
 * 旧版裸 ID 的唯一性按 **父级身份键** 计数：同一个工具集展开的多个子工具共享同一个
 * `promptReference`（同 id / legacyId），不能因为它们产生了多条运行记录就判定为歧义。
 */
export const buildPromptToolReferenceInfoMap = (
  tools: { promptReference?: PromptToolReferenceInfoType }[]
): PromptToolReferenceInfoMapResult => {
  const references = tools
    .map((tool) => tool.promptReference)
    .filter((reference): reference is PromptToolReferenceInfoType => Boolean(reference));

  const referenceInfoMap = new Map<string, string>();
  references.forEach((reference) => {
    referenceInfoMap.set(reference.id, reference.name);
  });

  // legacyId -> 不同的父级身份键集合。同一父级展开的多个子工具只算一个来源。
  const legacyIdIdentityKeys = new Map<string, Set<string>>();
  references.forEach((reference) => {
    const legacyId = reference.legacyId;
    const identityKeys = legacyIdIdentityKeys.get(legacyId) ?? new Set<string>();
    identityKeys.add(reference.id);
    legacyIdIdentityKeys.set(legacyId, identityKeys);
  });

  const ambiguousLegacyIds = new Set<string>();
  references.forEach((reference) => {
    const legacyId = reference.legacyId;
    // 多个父级共享同一裸 ID 时不猜测具体来源，并记录为歧义，避免替换层继续回退派生候选。
    if ((legacyIdIdentityKeys.get(legacyId)?.size ?? 0) !== 1) {
      ambiguousLegacyIds.add(legacyId);
      return;
    }
    if (referenceInfoMap.has(legacyId)) return;
    referenceInfoMap.set(legacyId, reference.name);
  });

  return { referenceInfoMap, ambiguousLegacyIds };
};

/**
 * 将 PromptEditor 持久化的工具引用替换为模型可识别的具体工具名称。
 * 先把历史数据里的多层花括号折叠为单层，再按引用键候选依次匹配，
 * 未命中时保留折叠后的单层原文。
 *
 * `isAmbiguousReference` 命中的原始引用键表示该裸键在多个来源间有歧义：
 * 此时直接保留原文并终止候选兜底，避免派生候选（如 `report`）命中某个来源的运行时 ID。
 */
export const replaceAgentPromptToolReferences = ({
  text,
  resolveName,
  isAmbiguousReference
}: {
  text: string;
  resolveName: (id: string) => string | undefined;
  isAmbiguousReference?: (id: string) => boolean;
}) =>
  normalizeToolReferenceBraces(text).replace(toolReferenceReg, (raw, _left, _at, id: string) => {
    // 歧义判断与候选生成必须使用同一个规范化键，避免带空格引用绕过歧义集合。
    const referenceId = typeof id === 'string' ? id.trim() : '';
    if (!referenceId) return raw;
    if (isAmbiguousReference?.(referenceId)) return raw;

    const name = getToolReferenceKeyCandidates(referenceId)
      .map((candidate) => resolveName(candidate))
      .find(Boolean);

    return name ? `{{${name}}}` : raw;
  });
