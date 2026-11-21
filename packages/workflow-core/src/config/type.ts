import { VariableItemTypeSchema } from '@fastgpt/global/core/app/variable/type';
import z from 'zod';

export const CHAT_CONFIG_PATHS = [
  'welcomeText',
  'welcomeConfig',
  'welcomeConfig.welcomeText',
  'welcomeConfig.welcomeQuestions',
  'autoExecute',
  'autoExecute.open',
  'autoExecute.defaultPrompt',
  'questionGuide',
  'questionGuide.open',
  'questionGuide.model',
  'questionGuide.customPrompt',
  'ttsConfig',
  'whisperConfig',
  'scheduledTriggerConfig',
  'chatInputGuide',
  'fileSelectConfig',
  'instruction'
] as const;

export type ChatConfigPath = (typeof CHAT_CONFIG_PATHS)[number];

export type ConfigAutomationMeta = {
  agentHint?: string;
  capabilities?: string[];
};

export type ConfigDescriptor = {
  path: ChatConfigPath;
  description: string;
  valueSchema: Record<string, unknown>;
  capabilities: string[];
  value: unknown;
};

export const AddGlobalVariableInputSchema = VariableItemTypeSchema.extend({
  key: z.string().optional()
});
export type AddGlobalVariableInput = z.infer<typeof AddGlobalVariableInputSchema>;

export const UpdateGlobalVariablePatchSchema = VariableItemTypeSchema.omit({ key: true })
  .partial()
  .extend({
    // 不兼容旧值：全局变量 key 创建后不可变，显式拒绝旧版 variable.update.patch.key，改展示名请修改 label。
    key: z.never({ message: 'Variable key cannot be modified' }).optional()
  });
export type UpdateGlobalVariablePatch = z.infer<typeof UpdateGlobalVariablePatchSchema>;
