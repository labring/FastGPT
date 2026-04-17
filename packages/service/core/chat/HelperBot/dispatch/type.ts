import { z } from 'zod';
import { HelperBotCompletionsParamsSchema } from '../../../../../global/openapi/core/chat/helperBot/api';
import {
  AIChatItemValueItemSchema,
  HelperBotChatItemSchema
} from '@fastgpt/global/core/chat/helperBot/type';
import { WorkflowResponseFnSchema } from '../../../workflow/dispatch/type';
import { LocaleList } from '@fastgpt/global/common/i18n/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const HelperBotDispatchParamsSchema = z.object({
  query: z.string(),
  files: HelperBotCompletionsParamsSchema.shape.files,
  data: z.unknown(), // Allow any type, will be constrained by generic type parameter
  histories: z.array(HelperBotChatItemSchema),
  workflowResponseWrite: WorkflowResponseFnSchema,

  user: z.object({
    teamId: z.string(),
    tmbId: z.string(),
    userId: z.string(),
    isRoot: z.boolean(),
    lang: z.enum(LocaleList)
  })
});

type BaseHelperBotDispatchParamsType = z.infer<typeof HelperBotDispatchParamsSchema>;
export type HelperBotDispatchParamsType<T = unknown> = Omit<
  BaseHelperBotDispatchParamsType,
  'data'
> & {
  data: T;
};

export const HelperBotDispatchResponseSchema = z.object({
  aiResponse: z.array(AIChatItemValueItemSchema),
  usage: z.object({
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number()
  })
});
export type HelperBotDispatchResponseType = z.infer<typeof HelperBotDispatchResponseSchema>;

/* AI 表单输出 schema */
const InputSchema = z.object({
  type: z.enum([FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.numberInput]),
  label: z.string()
});
const SelectSchema = z.object({
  type: z.enum([FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.multipleSelect]),
  label: z.string(),
  options: z.array(z.string())
});
export const AICollectionAnswerSchema = z.object({
  question: z.string(), // 可能只有一个问题，可能
  form: z.array(z.union([InputSchema, SelectSchema])).optional()
});
export type AICollectionAnswerType = z.infer<typeof AICollectionAnswerSchema>;
