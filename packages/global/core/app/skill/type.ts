import z from 'zod';

export enum SkillCategoryEnum {
  writing = 'writing',
  coding = 'coding',
  research = 'research',
  customerService = 'customer-service',
  dataAnalysis = 'data-analysis'
}

// Skill template metadata
export const SkillTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  avatar: z.string(),
  author: z.string(),
  version: z.string(),
  tags: z.array(z.string()),
  category: z.nativeEnum(SkillCategoryEnum)
});
export type SkillTemplateType = z.infer<typeof SkillTemplateSchema>;

// Skill variable definition
export const SkillVariableSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['input', 'textarea', 'select']),
  required: z.boolean().default(false),
  defaultValue: z.string().optional(),
  options: z.array(z.string()).optional(),
  description: z.string().optional()
});
export type SkillVariableType = z.infer<typeof SkillVariableSchema>;

// Skill configuration (what the skill actually does)
export const SkillConfigSchema = z.object({
  systemPrompt: z.string(),
  tools: z.array(z.string()).default([]),
  variables: z.array(SkillVariableSchema).default([]),
  datasetIds: z.array(z.string()).optional(),
  model: z.string().optional(),
  temperature: z.number().optional(),
  maxHistories: z.number().optional()
});
export type SkillConfigType = z.infer<typeof SkillConfigSchema>;

// Full skill manifest = template + config
export const SkillManifestSchema = SkillTemplateSchema.extend({
  config: SkillConfigSchema
});
export type SkillManifestType = z.infer<typeof SkillManifestSchema>;
