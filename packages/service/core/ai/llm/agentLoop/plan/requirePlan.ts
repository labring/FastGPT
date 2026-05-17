import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

const EXPLICIT_PLAN_PATTERNS = [
  /计划模式/i,
  /plan\s*mode/i,
  /active\s*plan/i,
  /update[_\s-]?plan/i,
  /更新.{0,8}(计划|plan|步骤状态)/i,
  /(创建|制定|生成|拆解).{0,16}(计划|plan|步骤)/i,
  /(create|make|draft|build).{0,16}(plan|steps)/i,
  /(每|逐).{0,8}(步|步骤).{0,16}(更新|维护|标记).{0,8}(计划|plan|状态)/i,
  /(step[-\s]?by[-\s]?step).{0,16}(plan|update)/i
];

const getMessageTextContent = (message?: ChatCompletionMessageParam) => {
  if (!message?.content) return '';
  if (typeof message.content === 'string') return message.content;

  return message.content
    .map((item) => {
      if (item.type === 'text') return item.text;
      return '';
    })
    .join('\n');
};

/**
 * 判断本轮用户是否明确要求维护 plan。
 * 这不是复杂度判断，而是 UI/状态契约：用户说“计划模式/创建计划/每步更新计划”时，
 * 即使模型觉得可以直接回答，也必须先通过 update_plan 创建 active plan。
 */
export const shouldRequirePlanFromMessages = (messages: ChatCompletionMessageParam[]) => {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  const text = getMessageTextContent(lastUserMessage);

  return EXPLICIT_PLAN_PATTERNS.some((pattern) => pattern.test(text));
};
