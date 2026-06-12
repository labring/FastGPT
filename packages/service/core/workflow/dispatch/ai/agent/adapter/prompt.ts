import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';

const toolReferenceReg = /\{\{@([^@{}]+)@\}\}/g;

export type ResolvePromptToolReferenceNameFn = (id: string) => string | undefined;

const getToolReferenceIdCandidates = (id: string) => {
  const trimId = id.trim();
  const candidates = [trimId];

  try {
    const { pluginId } = splitCombineToolId(trimId);
    const runtimeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');

    // PromptEditor 保存的是组合工具 ID，runtime catalog 使用清洗后的 pluginId 作为工具 ID。
    for (const candidate of [pluginId, runtimeId]) {
      if (candidate && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  } catch {
    // 非组合工具 ID 按原始值查询即可。
  }

  return candidates;
};

/**
 * 将 PromptEditor 保存的工具引用 ID 转成人类可读工具名。
 * 只依赖 prompt 引用解析器，不关心工具是否可执行，避免和 runtime 工具 catalog 耦合。
 */
export const replaceToolReferenceWithName = ({
  text,
  resolvePromptToolReferenceName
}: {
  text: string;
  resolvePromptToolReferenceName: ResolvePromptToolReferenceNameFn;
}) => {
  return text.replace(toolReferenceReg, (raw, id: string) => {
    const name = getToolReferenceIdCandidates(id)
      .map((candidate) => resolvePromptToolReferenceName(candidate))
      .find(Boolean);

    return name ? `{{${name}}}` : raw;
  });
};

/**
 * workflow 适配层负责把用户配置和已选知识库整理成主 loop 可读的背景信息。
 * 这里不包含任何 agent 角色或路由规则，避免把规划/路由 prompt 混入主上下文。
 */
export const parseUserSystemPrompt = ({
  userSystemPrompt,
  resolvePromptToolReferenceName
}: {
  userSystemPrompt?: string;
  resolvePromptToolReferenceName: ResolvePromptToolReferenceNameFn;
}) => {
  if (!userSystemPrompt) {
    return '';
  }

  const readableSystemPrompt = replaceToolReferenceWithName({
    text: userSystemPrompt,
    resolvePromptToolReferenceName
  });

  return `${readableSystemPrompt}

请参考用户的任务信息来匹配是否和当前的 <user_background></user_background> 一致，如果一致请优先遵循参考的步骤安排和偏好
如果和 <user_background></user_background> 没有任何关系则忽略参考信息。

**重要**：如果背景信息中包含工具引用（@工具名），请优先使用这些工具。当有多个同类工具可选时（如多个搜索工具），优先选择背景信息中已使用的工具，避免功能重叠。`;
};
