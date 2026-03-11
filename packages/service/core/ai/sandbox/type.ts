import z from 'zod';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxProviderSchema = z.enum(['sealosdevbox']);
export type SandboxProviderType = z.infer<typeof SandboxProviderSchema>;

export const SandboxLimitSchema = z.object({
  cpuCount: z.number(),
  memoryMiB: z.number(),
  diskGiB: z.number()
});
export const SandboxInstanceZodSchema = z.object({
  _id: z.string(),
  sandboxId: z.string(),
  appId: z.string().nullish(),
  userId: z.string().nullish(),
  chatId: z.string().nullish(),
  status: z.enum(SandboxStatusEnum),
  lastActiveAt: z.date(),
  createdAt: z.date(),
  limit: SandboxLimitSchema.nullish(),
  provider: SandboxProviderSchema
});

export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
