import { z } from 'zod';
import { topAgentParamsSchema } from '../topAgent/type';

// SkillAgent 参数配置 (区分 skill 特有配置和 topAgent 通用配置)
export const skillAgentParamsSchema = z.object({
  // Skill 特有配置
  skillAgent: z
    .object({
      name: z.string().nullish(),
      description: z.string().nullish(),
      stepsText: z.string().nullish()
    })
    .nullish(),
  // TopAgent 通用配置
  topAgent: topAgentParamsSchema.nullish()
});
export type SkillAgentParamsType = z.infer<typeof skillAgentParamsSchema>;

/* 模型生成结构 */
// 工具定义
export const GeneratedSkillToolSchema = z.object({
  id: z.string(),
  type: z.enum(['tool', 'knowledge'])
});

// 步骤定义
export const GeneratedSkillStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  expectedTools: z.array(GeneratedSkillToolSchema)
});

// 任务分析
const TaskAnalysisSchema = z.object({
  name: z.string(),
  description: z.string(),
  goal: z.string(),
  type: z.string()
});

// LLM 返回的完整数据
const FormInputSchema = z.object({
  type: z.literal('input').or(z.literal('numberInput')),
  label: z.string()
});
const FormSelectSchema = z.object({
  type: z.literal('select').or(z.literal('multipleSelect')),
  label: z.string(),
  options: z.array(z.string())
});

export const GeneratedSkillDataCollectionSchema = z.object({
  phase: z.literal('collection'),
  reasoning: z.string(),
  question: z.string(),
  form: z.array(z.union([FormInputSchema, FormSelectSchema])).optional()
});
export type GeneratedSkillDataCollectionType = z.infer<typeof GeneratedSkillDataCollectionSchema>;
export const GeneratedSkillResultSchema = z.object({
  phase: z.literal('generation'),
  plan_analysis: TaskAnalysisSchema,
  execution_plan: z.object({
    total_steps: z.number(),
    steps: z.array(GeneratedSkillStepSchema)
  })
});
export type GeneratedSkillResultType = z.infer<typeof GeneratedSkillResultSchema>;
export const GeneratedSkillSchema = z.union([
  GeneratedSkillDataCollectionSchema,
  GeneratedSkillResultSchema
]);
export type GeneratedSkillType = z.infer<typeof GeneratedSkillSchema>;
