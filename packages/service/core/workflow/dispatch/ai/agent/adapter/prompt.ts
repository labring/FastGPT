/**
 * workflow 适配层负责把用户配置和已选知识库整理成主 loop 可读的背景信息。
 * 这里不包含任何 agent 角色或路由规则，避免把规划/路由 prompt 混入主上下文。
 */
export const parseUserSystemPrompt = ({ userSystemPrompt }: { userSystemPrompt?: string }) => {
  if (!userSystemPrompt) {
    return '';
  }

  return `${userSystemPrompt}

请参考用户的任务信息来匹配是否和当前的 <user_background></user_background> 一致，如果一致请优先遵循参考的步骤安排和偏好
如果和 <user_background></user_background> 没有任何关系则忽略参考信息。

**重要**：如果背景信息中包含工具引用（@工具名），请优先使用这些工具。当有多个同类工具可选时（如多个搜索工具），优先选择背景信息中已使用的工具，避免功能重叠。`;
};
