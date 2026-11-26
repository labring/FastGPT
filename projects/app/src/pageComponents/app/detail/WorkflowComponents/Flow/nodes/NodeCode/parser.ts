import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputItemTypeSchema } from '@fastgpt/global/core/workflow/type/io';

/** 从助手 Markdown 和生成提示词约定的 JSDoc 提取代码、端口和引用。 */
export const extractCodeFromMarkdown = (
  markdownContent: string
): {
  code: string;
  inputs: Array<{ key: string; type: WorkflowIOValueTypeEnum; reference?: string }>;
  outputs: Array<{ key: string; type: WorkflowIOValueTypeEnum }>;
} => {
  const codeBlockRegex = /```(?:\w+\n)?([\s\S]*?)```/;
  const codeMatch = markdownContent.match(codeBlockRegex);
  const code = codeMatch ? codeMatch[1].trim() : markdownContent.trim();
  const parseValueType = (type: string) =>
    FlowNodeInputItemTypeSchema.shape.valueType.safeParse(type.trim()).data ??
    WorkflowIOValueTypeEnum.any;

  // 保留输入参数的变量引用，应用代码时据此恢复节点连线引用。
  const paramMatches = [
    ...code.matchAll(/@param\s*\{([^}]+)\}\s*(\w+)\s*(?:\[([^\]]+)\])?\s*-?\s*.*/g)
  ];
  const inputs = paramMatches.map((paramMatch) => ({
    key: paramMatch[2].trim(),
    type: parseValueType(paramMatch[1]),
    reference: paramMatch[3] ? paramMatch[3].trim() : undefined
  }));

  const outputs = [...code.matchAll(/@property\s*\{([^}]+)\}\s*(\S+)\s*-?\s*.*/g)].map(
    (propertyMatch) => ({
      key: propertyMatch[2].trim(),
      type: parseValueType(propertyMatch[1])
    })
  );
  // JSDoc 已转换为节点配置，实际代码保留原有去除注释的行为。
  const cleanCode = code.replace(/\/\*\*[\s\S]*?\*\//g, '').trim();

  return { code: cleanCode, inputs, outputs };
};
