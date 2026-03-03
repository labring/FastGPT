import { z } from 'zod';

export const AppRecordSchemaZod = z.object({
  _id: z.string(),
  tmbId: z.string(),
  teamId: z.string(),
  appId: z.string(),
  lastUsedTime: z.date()
});

// TypeScript types inferred from Zod schemas
export type AppRecordType = z.infer<typeof AppRecordSchemaZod>;
