/* 
  匹配 {{@toolId@}}，转化成: @name 的格式。
*/
export const parseAgentSystemPrompt = ({
  systemPrompt,
  getSubAppInfo
}: {
  systemPrompt: string;
  getSubAppInfo: (id: string) => {
    name: string;
    avatar: string;
    toolDescription: string;
  };
}): string => {
  if (!systemPrompt) return '';

  // Match pattern {{@toolId@}} and convert to @name format
  const pattern = /\{\{@([^@]+)@\}\}/g;

  const processedPrompt = systemPrompt.replace(pattern, (match, toolId) => {
    const toolInfo = getSubAppInfo(toolId);
    if (!toolInfo) {
      console.warn(`Tool not found for ID: ${toolId}`);
      return match; // Return original match if tool not found
    }

    return `@${toolInfo.name}`;
  });

  return processedPrompt;
};
