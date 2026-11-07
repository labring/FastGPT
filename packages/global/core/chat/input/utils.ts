import { UserChatSelectSchema, type UserChatSelectType } from './type';
import type { ChatItemValueItemType } from '../type';

/** 读取结构化用户输入；旧数据或无效内容直接忽略，不恢复旧 Ask 协议。 */
export const getUserChatSelect = (
  values?: ChatItemValueItemType[]
): UserChatSelectType | undefined => {
  if (!Array.isArray(values)) return;
  for (const value of values) {
    if (!value || typeof value !== 'object' || !('select' in value)) continue;
    const result = UserChatSelectSchema.safeParse(value.select);
    if (result.success) return result.data;
  }
};

/** 生成模型可读回复；Ask 的空回答表示跳过，Preview 使用稳定动作及修改意见。 */
export const formatUserChatSelect = (select: UserChatSelectType) => {
  if (select.type === 'workflowBuilderPreview') {
    return userChatSelect2RuntimeText(select);
  }
  return select.questions
    .map(({ question, value }) => `## ${question}\n\n回答：${value === '' ? '未回答' : value}`)
    .join('\n\n');
};

/** Ask 续跑传递答案数组；Preview 仅传递动作，并在 revise 时传递必选修改意见。 */
export const userChatSelect2RuntimeText = (select: UserChatSelectType) =>
  select.type === 'agentAsk'
    ? JSON.stringify({ answers: select.questions.map(({ value }) => value) })
    : JSON.stringify({
        action: select.action,
        ...(select.action === 'revise' ? { reviseText: select.reviseText } : {})
      });
