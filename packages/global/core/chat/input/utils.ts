import { UserChatSelectSchema, type UserChatSelectType } from './type';
import type { ChatItemValueItemType } from '../type';
import { isAgentAskInteractive } from '../../workflow/runtime/utils';

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

/** 将用户消息中保存的问题和回答直接转为模型可读内容，空回答表示跳过。 */
export const formatUserChatSelect = (select: UserChatSelectType) =>
  select.questions
    .map(({ question, value }) => `## ${question}\n\n回答：${value === '' ? '未回答' : value}`)
    .join('\n\n');

/** Ask 续跑按题目顺序传递答案数组；Preview 直接使用用户的选择文案或修改意见。 */
export const userChatSelect2RuntimeText = (select: UserChatSelectType) =>
  isAgentAskInteractive(select)
    ? JSON.stringify({ answers: select.questions.map(({ value }) => value) })
    : (select.questions[0]?.value ?? '');
