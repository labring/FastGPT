import {
  extractCodeInputDefinitions,
  extractCodeOutputDefinitions
} from '@fastgpt/workflow-core/code/io';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

/** 复用 Core 解析真实代码 IO；Markdown 和输入引用注解只在 Web 边界处理。 */
export const extractCodeFromMarkdown = (
  markdownContent: string
): {
  code: string;
  inputs: Array<{ key: string; type: string; reference?: string }>;
  outputs: Array<{ key: string; type: string }>;
} => {
  const codeBlockRegex = /```(?:\w+\n)?([\s\S]*?)```/;
  const codeMatch = markdownContent.match(codeBlockRegex);
  const code = codeMatch ? codeMatch[1].trim() : markdownContent.trim();

  // 保留输入参数的变量引用，应用代码时据此恢复节点连线引用。
  const paramMatches = [
    ...code.matchAll(/@param\s*\{([^}]+)\}\s*(\w+)\s*(?:\[([^\]]+)\])?\s*-?\s*.*/g)
  ];
  const documentedInputs = paramMatches.map((paramMatch) => ({
    key: paramMatch[2].trim(),
    type: paramMatch[1].trim(),
    reference: paramMatch[3] ? paramMatch[3].trim() : undefined
  }));

  const documentedOutputs = [...code.matchAll(/@property\s*\{([^}]+)\}\s*(\S+)\s*-?\s*.*/g)].map(
    (propertyMatch) => ({
      key: propertyMatch[2].trim(),
      type: propertyMatch[1].trim()
    })
  );
  const inputs =
    extractCodeInputDefinitions(code)?.map(({ key, valueType }) => ({
      key,
      type: valueType ?? WorkflowIOValueTypeEnum.any,
      reference: documentedInputs.find((input) => input.key === key)?.reference
    })) ?? documentedInputs;
  // 动态 return 无法静态推断时保留注解，避免应用代码时误删已有输出。
  const outputs =
    extractCodeOutputDefinitions(code)?.map(({ key, valueType }) => ({
      key,
      type: valueType ?? WorkflowIOValueTypeEnum.any
    })) ?? documentedOutputs;

  // JSDoc 已转换为节点配置，实际代码保留原有去除注释的行为。
  const cleanCode = code.replace(/\/\*\*[\s\S]*?\*\//g, '').trim();

  return { code: cleanCode, inputs, outputs };
};
