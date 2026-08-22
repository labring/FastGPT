import { SelectedDatasetSchema } from '../../workflow/type/io';
import z from 'zod';
import { AppChatConfigTypeSchema, AppDatasetSearchParamsTypeSchema } from '../type';
import { FlowNodeTemplateTypeSchema, NodeToolConfigTypeSchema } from '../../workflow/type/node';
import { NodeInputKeyEnum } from '../../workflow/constants';
import { SANDBOX_ENTRYPOINT_MAX_LENGTH } from '../../ai/sandbox/constants';
import {
  AgentToolInputBoundarySchema,
  type AgentToolInputBoundary
} from '../../workflow/migration/schema';

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
export const StoredSelectedAgentSkillItemTypeSchema = SelectedAgentSkillItemTypeSchema.pick({
  skillId: true
});
export type StoredSelectedAgentSkillItemType = z.infer<
  typeof StoredSelectedAgentSkillItemTypeSchema
>;

/* ===== Tool ===== */
const SelectedToolItemBaseSchema = FlowNodeTemplateTypeSchema.extend({
  configStatus: z.enum(['noConfig', 'waitingForConfig', 'configured', 'invalid']).optional(),
  config: z.record(z.string(), z.unknown()).optional()
});

export const UnresolvedAgentToolTypeSchema = z.object({
  id: z.string(),
  version: z.string().optional(),
  source: z.string().optional(),
  toolConfig: NodeToolConfigTypeSchema.optional(),
  inputs: z.array(AgentToolInputBoundarySchema).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional()
});
export type UnresolvedAgentToolType = {
  id: string;
  version?: string;
  source?: string;
  toolConfig?: z.infer<typeof NodeToolConfigTypeSchema>;
  inputs?: AgentToolInputBoundary[];
  config?: Record<string, any>;
  error?: string;
};

export const SelectedToolItemTypeSchema = SelectedToolItemBaseSchema.extend({
  isUnavailable: z.never().optional()
});
export type SelectedToolItemType = z.infer<typeof SelectedToolItemTypeSchema>;
export type AvailableSelectedToolItemType = SelectedToolItemType;

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
    [NodeInputKeyEnum.useAgentSandbox]: z.boolean().default(false).optional(),
    [NodeInputKeyEnum.sandboxEntrypoint]: z.string().max(SANDBOX_ENTRYPOINT_MAX_LENGTH).optional()
  }),
  dataset: AppDatasetSearchParamsTypeSchema.extend({
    datasets: z.array(SelectedDatasetSchema)
  }),
  selectedTools: z.array(SelectedToolItemTypeSchema),
  selectedAgentSkills: z.array(SelectedAgentSkillItemTypeSchema).optional(),
  chatConfig: AppChatConfigTypeSchema
});
export type AppFormEditFormType = z.infer<typeof AppFormEditFormV1TypeSchema>;
