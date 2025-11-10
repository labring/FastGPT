export const extractCodeFromMarkdown = (
  markdownContent: string
): {
  code: string;
  inputs: Array<{ label: string; type: string; reference?: string }>;
  outputs: Array<{ label: string; type: string }>;
} => {
  const codeBlockRegex = /```(?:\w+\n)?([\s\S]*?)```/;
  const codeMatch = markdownContent.match(codeBlockRegex);
  let code = codeMatch ? codeMatch[1].trim() : markdownContent.trim();

  // Enhanced regex to capture reference information in square brackets
  const paramMatches = [
    ...code.matchAll(/@param\s*\{([^}]+)\}\s*(\w+)\s*(?:\[([^\]]+)\])?\s*-?\s*.*/g)
  ];
  const inputs = paramMatches.map((paramMatch) => ({
    label: paramMatch[2].trim(),
    type: paramMatch[1].trim(),
    reference: paramMatch[3] ? paramMatch[3].trim() : undefined
  }));

  const propertyMatches = [...code.matchAll(/@property\s*\{([^}]+)\}\s*(\w+)\s*-?\s*.*/g)];
  const outputs = propertyMatches.map((propertyMatch) => ({
    label: propertyMatch[2].trim(),
    type: propertyMatch[1].trim()
  }));

  // Remove comments from code before returning
  const cleanCode = code.replace(/\/\*\*[\s\S]*?\*\//g, '').trim();

  return { code: cleanCode, inputs, outputs };
};
