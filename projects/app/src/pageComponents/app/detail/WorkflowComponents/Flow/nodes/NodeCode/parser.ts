import { extractCodeOutputDefinitions } from '@fastgpt/global/common/workflow/code';

/** 从助手 Markdown 提取代码与参数；输出 key 优先取实际 return 对象，无法识别时兼容 JSDoc。 */
export const extractCodeFromMarkdown = (
  markdownContent: string
): {
  code: string;
  inputs: Array<{ label: string; type: string; reference?: string }>;
  outputs: Array<{ key: string; type: string }>;
} => {
  const codeBlockRegex = /```(?:\w+\n)?([\s\S]*?)```/;
  const codeMatch = markdownContent.match(codeBlockRegex);
  const code = codeMatch ? codeMatch[1].trim() : markdownContent.trim();

  // Enhanced regex to capture reference information in square brackets
  const paramMatches = [
    ...code.matchAll(/@param\s*\{([^}]+)\}\s*(\w+)\s*(?:\[([^\]]+)\])?\s*-?\s*.*/g)
  ];
  const inputs = paramMatches.map((paramMatch) => ({
    label: paramMatch[2].trim(),
    type: paramMatch[1].trim(),
    reference: paramMatch[3] ? paramMatch[3].trim() : undefined
  }));

  const documentedOutputs = [
    ...code.matchAll(/@property\s*\{([^}]+)\}\s*([^\s-]+)\s*-?\s*.*/g)
  ].map((propertyMatch) => ({
    key: propertyMatch[2].trim(),
    type: propertyMatch[1].trim()
  }));
  const returnedOutputs = extractCodeOutputDefinitions(code);
  const outputs = returnedOutputs
    ? returnedOutputs.map((output) => ({
        key: output.key,
        type: output.valueType ?? 'any'
      }))
    : documentedOutputs;

  // Remove comments from code before returning
  const cleanCode = code.replace(/\/\*\*[\s\S]*?\*\//g, '').trim();

  return { code: cleanCode, inputs, outputs };
};
