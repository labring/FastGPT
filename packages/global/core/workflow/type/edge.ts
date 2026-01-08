import { z } from 'zod';

export const StoreEdgeItemTypeSchema = z.object({
  source: z.string(),
  sourceHandle: z.string(),
  target: z.string(),
  targetHandle: z.string()
});
export type StoreEdgeItemType = z.infer<typeof StoreEdgeItemTypeSchema>;

export const RuntimeEdgeItemTypeSchema = StoreEdgeItemTypeSchema.and(
  z.object({
    status: z.enum(['waiting', 'active', 'skipped'])
  })
);
export type RuntimeEdgeItemType = z.infer<typeof RuntimeEdgeItemTypeSchema>;
