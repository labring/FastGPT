import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';

// 工具定义
export const GeneratedSkillToolSchema = z.object({
  id: z.string(),
  type: z.enum(['tool', 'knowledge'])
});
export type GeneratedSkillToolType = z.infer<typeof GeneratedSkillToolSchema>;

// 步骤定义
export const GeneratedSkillStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  expectedTools: z.array(GeneratedSkillToolSchema)
});
export type GeneratedSkillStepType = z.infer<typeof GeneratedSkillStepSchema>;

// 任务分析
export const TaskAnalysisSchema = z.object({
  name: z.string(),
  description: z.string(),
  goal: z.string(),
  type: z.string()
});
export type TaskAnalysisType = z.infer<typeof TaskAnalysisSchema>;

// LLM 返回的完整数据
export const GeneratedSkillDataSchema = z.object({
  phase: z.literal('generation'),
  plan_analysis: TaskAnalysisSchema,
  execution_plan: z.object({
    total_steps: z.number(),
    steps: z.array(GeneratedSkillStepSchema)
  })
});
export type GeneratedSkillDataType = z.infer<typeof GeneratedSkillDataSchema>;

// 数据库存储类型
export const HelperBotGeneratedSkillSchema = z.object({
  _id: ObjectIdSchema,
  userId: z.string(),
  tmbId: z.string(),
  teamId: z.string(),
  appId: z.string(),
  createTime: z.date(),
  updateTime: z.date(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.string().default(''),
  status: z.enum(['draft', 'active', 'archived']).default('draft')
});
export type HelperBotGeneratedSkillType = z.infer<typeof HelperBotGeneratedSkillSchema>;

// 前端展示类型
export const GeneratedSkillSiteSchema = HelperBotGeneratedSkillSchema.omit({
  userId: true,
  teamId: true
});
export type GeneratedSkillSiteType = z.infer<typeof GeneratedSkillSiteSchema>;
