/**
 * 改写用户配置的主 Agent 背景 prompt。
 *
 * 这里只处理纯 prompt 文本，不读取 workflow、sandbox、skill 等业务状态；
 * 调用方负责先把需要注入的运行上下文拼成 userSystemPrompt。
 */
export const parseAgentLoopCoreUserSystemPrompt = ({
  userSystemPrompt
}: {
  userSystemPrompt?: string;
}) => {
  if (!userSystemPrompt) {
    return '';
  }

  return `${userSystemPrompt}

请参考用户的任务信息来匹配是否和当前的 <user_background></user_background> 一致，如果一致请优先遵循参考的步骤安排和偏好
如果和 <user_background></user_background> 没有任何关系则忽略参考信息。

**重要**：如果背景信息中包含工具引用（@工具名），请优先使用这些工具。当有多个同类工具可选时（如多个搜索工具），优先选择背景信息中已使用的工具，避免功能重叠。`;
};

/**
 * 合并用户 prompt 和可选运行时 prompt 片段，再执行主 Agent prompt 改写。
 */
export const buildAgentLoopCoreSystemPrompt = ({
  userSystemPrompt,
  runtimePrompts = []
}: {
  userSystemPrompt?: string;
  runtimePrompts?: string[];
}) =>
  parseAgentLoopCoreUserSystemPrompt({
    userSystemPrompt: [userSystemPrompt, ...runtimePrompts].filter(Boolean).join('\n\n')
  });
