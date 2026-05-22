import { SelectedDatasetSchema } from '../../workflow/type/io';
import z from 'zod';
import { AppChatConfigTypeSchema, AppDatasetSearchParamsTypeSchema } from '../type';
import { FlowNodeTemplateTypeSchema } from '../../workflow/type/node';
import { NodeInputKeyEnum } from '../../workflow/constants';

export type AgentSubAppItemType = object;

/* ===== Agent Skill ===== */
export const SelectedAgentSkillItemTypeSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  description: z.string().default(''),
  avatar: z.string().optional(),
  isDeleted: z.boolean().default(false)
});
export type SelectedAgentSkillItemType = z.infer<typeof SelectedAgentSkillItemTypeSchema>;

/* ===== Tool ===== */
export const SelectedToolItemTypeSchema = FlowNodeTemplateTypeSchema.extend({
  configStatus: z.enum(['noConfig', 'waitingForConfig', 'configured', 'invalid']).optional()
});
export type SelectedToolItemType = z.infer<typeof SelectedToolItemTypeSchema>;

export const AppFormEditFormV1TypeSchema = z.object({
  aiSettings: z.object({
    [NodeInputKeyEnum.aiModel]: z.string(),
    [NodeInputKeyEnum.aiSystemPrompt]: z.string().optional(),

    [NodeInputKeyEnum.aiChatTemperature]: z.number().optional(),
    [NodeInputKeyEnum.aiChatMaxToken]: z.number().optional(),
    [NodeInputKeyEnum.aiChatIsResponseText]: z.boolean(),
    maxHistories: z.int().min(0).max(100),
    [NodeInputKeyEnum.aiChatVision]: z.boolean().optional(),
    [NodeInputKeyEnum.aiChatAudio]: z.boolean().optional(),
    [NodeInputKeyEnum.aiChatVideo]: z.boolean().optional(),
    [NodeInputKeyEnum.aiChatExtractFiles]: z.boolean().optional(),
    [NodeInputKeyEnum.aiChatReasoning]: z.boolean().optional(),
    [NodeInputKeyEnum.aiChatReasoningEffort]: z
      .enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh'])
      .nullish(),
    [NodeInputKeyEnum.aiChatTopP]: z.number().optional(),
    [NodeInputKeyEnum.aiChatStopSign]: z.string().optional(),
    [NodeInputKeyEnum.aiChatResponseFormat]: z.string().optional(),
    [NodeInputKeyEnum.aiChatJsonSchema]: z.string().optional(),
    [NodeInputKeyEnum.useAgentSandbox]: z.boolean().default(false).optional()
  }),
  dataset: AppDatasetSearchParamsTypeSchema.extend({
    datasets: z.array(SelectedDatasetSchema)
  }),
  selectedTools: z.array(SelectedToolItemTypeSchema),
  selectedAgentSkills: z.array(SelectedAgentSkillItemTypeSchema).optional(),
  chatConfig: AppChatConfigTypeSchema
});
export type AppFormEditFormType = z.infer<typeof AppFormEditFormV1TypeSchema>;
