import z from 'zod';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxInstanceZodSchema = z.object({
  _id: z.string(),
  sandboxId: z.string(),
  appId: z.string(),
  userId: z.string(),
  chatId: z.string(),
  status: z.enum(SandboxStatusEnum),
  lastActiveAt: z.date(),
  createdAt: z.date()
});

export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
