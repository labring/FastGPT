import { SelectedDatasetSchema } from '../../workflow/type/io';
import z from 'zod';
import { AppChatConfigTypeSchema, AppDatasetSearchParamsTypeSchema } from '../type';
import { FlowNodeTemplateTypeSchema } from '../../workflow/type/node';
import { NodeInputKeyEnum } from '../../workflow/constants';

export type AgentSubAppItemType = {};

/* ===== Agent Skill ===== */
export const SelectedAgentSkillItemTypeSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  description: z.string().default(''),
  avatar: z.string().optional()
});
export type SelectedAgentSkillItemType = z.infer<typeof SelectedAgentSkillItemTypeSchema>;

/**
 * 将 skills 输入值规范化为 skillId 字符串数组。
 * 兼容两种格式：
 *   - string[]：debugChat 运行时直接传入的 skillId 数组
 *   - SelectedAgentSkillItemType[]：工作流 NodeAgent 存储的完整对象数组（含 name/avatar 等展示字段）
 */
export const normalizeSkillIds = (
  skills: Array<string | SelectedAgentSkillItemType> | undefined
): string[] => (skills ?? []).map((s) => (typeof s === 'string' ? s : s.skillId)).filter(Boolean);

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
