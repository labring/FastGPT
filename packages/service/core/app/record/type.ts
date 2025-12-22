import { z } from 'zod';

// Zod schemas
export const AppRecordSchemaZod = z.object({
  _id: z.string().optional(),
  tmbId: z.string(),
  teamId: z.string(),
  appId: z.string(),
  lastUsedTime: z.date()
});

// TypeScript types inferred from Zod schemas
export type AppRecordType = z.infer<typeof AppRecordSchemaZod>;
