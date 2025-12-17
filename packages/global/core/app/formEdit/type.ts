import { SelectedDatasetSchema } from '../../workflow/type/io';
import { z } from 'zod';
import { AppChatConfigTypeSchema, AppDatasetSearchParamsTypeSchema } from '../type';
import { FlowNodeTemplateTypeSchema } from '../../workflow/type/node';
import { NodeInputKeyEnum } from '../../workflow/constants';

export type AgentSubAppItemType = {};

/* ===== Tool ===== */
export const SelectedToolItemTypeSchema = FlowNodeTemplateTypeSchema.and(
  z.object({
    configStatus: z.enum(['active', 'waitingForConfig', 'invalid']).optional()
  })
);
export type SelectedToolItemType = z.infer<typeof SelectedToolItemTypeSchema>;

/* ===== skill ===== */
export const SkillEditTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  stepsText: z.string().optional(), // 执行步骤的文本描述
  dataset: z.object({
    list: z.array(SelectedDatasetSchema)
  }),
  selectedTools: z.array(SelectedToolItemTypeSchema)
});
export type SkillEditType = z.infer<typeof SkillEditTypeSchema>;

export const AppFormEditFormV1TypeSchema = z.object({
  aiSettings: z.object({
    [NodeInputKeyEnum.aiModel]: z.string(),
    [NodeInputKeyEnum.aiSystemPrompt]: z.string().optional(),
    [NodeInputKeyEnum.aiRole]: z.string().optional(),
    [NodeInputKeyEnum.aiTaskObject]: z.string().optional(),

    [NodeInputKeyEnum.aiChatTemperature]: z.number().optional(),
    [NodeInputKeyEnum.aiChatMaxToken]: z.number().optional(),
    [NodeInputKeyEnum.aiChatIsResponseText]: z.boolean(),
    maxHistories: z.int().min(0).max(100),
    [NodeInputKeyEnum.aiChatReasoning]: z.boolean().optional(),
    [NodeInputKeyEnum.aiChatTopP]: z.number().optional(),
    [NodeInputKeyEnum.aiChatStopSign]: z.string().optional(),
    [NodeInputKeyEnum.aiChatResponseFormat]: z.string().optional(),
    [NodeInputKeyEnum.aiChatJsonSchema]: z.string().optional()
  }),
  dataset: AppDatasetSearchParamsTypeSchema.and(
    z.object({
      datasets: z.array(SelectedDatasetSchema)
    })
  ),
  selectedTools: z.array(SelectedToolItemTypeSchema),
  skills: z.array(SkillEditTypeSchema),
  chatConfig: AppChatConfigTypeSchema
});
export type AppFormEditFormType = z.infer<typeof AppFormEditFormV1TypeSchema>;
