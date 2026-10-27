import z from 'zod';
import { ChatCompletionMessageParamSchema } from '../llm/type';
import { ChatFileTypeEnum } from '../../chat/constants';
import { SelectedAgentSkillItemTypeSchema } from '../../app/formEdit/type';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { ChatAgentHelperTypeEnum } from './constants';

export const AuxiliaryGenerationChatFileSchema = z.object({
  type: z.enum(ChatFileTypeEnum),
  key: z.string(),
  url: z.string().optional(),
  name: z.string()
});
export type AuxiliaryGenerationChatFileType = z.infer<typeof AuxiliaryGenerationChatFileSchema>;

export const ChatAgentHelperMetadataSchema = z.object({
  role: z.string().nullish(),
  taskObject: z.string().nullish(),
  systemPrompt: z.string().nullish(),
  selectedTools: z.array(z.string()).nullish(),
  selectedDatasets: z.array(z.string()).nullish(),
  selectedAgentSkills: z.array(SelectedAgentSkillItemTypeSchema).nullish(),
  fileUpload: z.boolean().nullish(),
  enableSandbox: z.boolean().nullish(),
  modelConfig: z
    .object({
      modelId: z.string().optional().meta({
        description: '辅助生成模型 ID'
      })
    })
    .optional()
});
export type ChatAgentHelperMetadataType = z.infer<typeof ChatAgentHelperMetadataSchema>;

export const AuxiliaryGenerationSelectedDatasetSchema = z.object({
  datasetId: z.string().meta({
    description: '可选知识库 ID'
  }),
  avatar: z.string().meta({
    description: '可选知识库头像'
  }),
  name: z.string().meta({
    description: '可选知识库名称'
  }),
  vectorModel: z.object({
    model: z.string().meta({
      description: '知识库使用的向量模型'
    })
  }),
  error: z.string().optional()
});
export type AuxiliaryGenerationSelectedDatasetType = z.infer<
  typeof AuxiliaryGenerationSelectedDatasetSchema
>;

export const ChatAgentConfigFormDataSchema = z.object({
  systemPrompt: z.string().optional(),
  // 兼容旧字符串引用；系统与团队安装的工具需要同时传递 id 和 source。
  tools: z
    .array(z.union([z.string(), z.object({ id: z.string(), source: z.string() })]))
    .optional()
    .default([]),
  datasets: z.array(AuxiliaryGenerationSelectedDatasetSchema).optional().default([]),
  selectedAgentSkills: z.array(SelectedAgentSkillItemTypeSchema).optional().default([]),
  fileUploadEnabled: z.boolean().optional().default(false),
  enableSandboxEnabled: z.boolean().optional().default(false),
  executionPlan: z.any().optional()
});
export type ChatAgentConfigFormDataType = z.infer<typeof ChatAgentConfigFormDataSchema>;

export const ChatAgentHelperCompletionsParamsSchema = z
  .object({
    chatId: z.string(),
    responseChatItemId: z.string(),
    appId: ObjectIdSchema,
    messages: z.array(ChatCompletionMessageParamSchema),
    metadata: z.object({
      type: z.literal(ChatAgentHelperTypeEnum.chatAgent),
      data: ChatAgentHelperMetadataSchema
    })
  })
  .superRefine(({ messages }, ctx) => {
    const lastUserMessage = messages.findLast((message) => message.role === 'user');

    if (!lastUserMessage?.dataId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['messages'],
        message: 'ChatAgentHelper messages requires a user message with dataId'
      });
    }
  });
export type ChatAgentHelperCompletionsParamsType = z.infer<
  typeof ChatAgentHelperCompletionsParamsSchema
>;
