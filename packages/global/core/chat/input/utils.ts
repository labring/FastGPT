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

/** 将结构化回答转为模型可读内容；原始选项值保留，避免展示文字改变提交语义。 */
export const formatUserChatSelect = (select: UserChatSelectType) =>
  select.questions
    .map(({ question, value, answer }) => {
      const content = !value
        ? '未回答'
        : answer && answer !== value
          ? `${answer} - ${value}`
          : value;
      return `## ${question}\n\n回答：${content}`;
    })
    .join('\n\n');

/** Ask 续跑需要原始答案数组；Preview 的动作在结构化输入中读取，文本只提供用户反馈。 */
export const userChatSelect2RuntimeText = (select: UserChatSelectType) =>
  isAgentAskInteractive(select)
    ? JSON.stringify({ answers: select.questions.map(({ value }) => value) })
    : (select.feedback ?? select.questions[0].answer);
