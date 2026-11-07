/** 从助手 Markdown 和 JSDoc 提取代码、参数 key、类型及引用；属性名与 return key 的一致性由生成提示词约束。 */
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
  const inputs = paramMatches.map((paramMatch) => ({
    key: paramMatch[2].trim(),
    type: paramMatch[1].trim(),
    reference: paramMatch[3] ? paramMatch[3].trim() : undefined
  }));

  const outputs = [...code.matchAll(/@property\s*\{([^}]+)\}\s*(\S+)\s*-?\s*.*/g)].map(
    (propertyMatch) => ({
      key: propertyMatch[2].trim(),
      type: propertyMatch[1].trim()
    })
  );
  // JSDoc 已转换为节点配置，实际代码保留原有去除注释的行为。
  const cleanCode = code.replace(/\/\*\*[\s\S]*?\*\//g, '').trim();

  return { code: cleanCode, inputs, outputs };
};
