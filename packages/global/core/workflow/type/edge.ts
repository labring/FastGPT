import z from 'zod';

export const StoreEdgeItemTypeSchema = z.object({
  source: z.string().meta({
    description: '连线起点节点 ID'
  }),
  sourceHandle: z.string().meta({
    description: '连线起点输出桩 ID'
  }),
  target: z.string().meta({
    description: '连线终点节点 ID'
  }),
  targetHandle: z.string().meta({
    description: '连线终点输入桩 ID'
  })
});
export type StoreEdgeItemType = z.infer<typeof StoreEdgeItemTypeSchema>;

export const RuntimeEdgeItemTypeSchema = StoreEdgeItemTypeSchema.extend({
  status: z.enum(['waiting', 'active', 'skipped'])
});
export type RuntimeEdgeItemType = z.infer<typeof RuntimeEdgeItemTypeSchema>;
