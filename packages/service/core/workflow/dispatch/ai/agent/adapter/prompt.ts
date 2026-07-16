import { splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';

const toolReferenceReg = /\{\{@([^@{}]+)@\}\}/g;

const getToolReferenceIdCandidates = (id: string) => {
  const trimmedId = id.trim();
  const candidates = [trimmedId];

  try {
    const { pluginId } = splitCombineToolId(trimmedId);
    const runtimeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');

    for (const candidate of [pluginId, runtimeId]) {
      if (candidate && !candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  } catch {
    // 非组合工具 ID 只使用原值解析。
  }

  return candidates;
};

/** 将 PromptEditor 持久化的工具 ID 替换为模型可识别的具体工具名称。 */
export const replaceAgentPromptToolReferences = ({
  text,
  resolveName
}: {
  text: string;
  resolveName: (id: string) => string | undefined;
}) =>
  text.replace(toolReferenceReg, (raw, id: string) => {
    const name = getToolReferenceIdCandidates(id)
      .map((candidate) => resolveName(candidate))
      .find(Boolean);

    return name ? `{{${name}}}` : raw;
  });
