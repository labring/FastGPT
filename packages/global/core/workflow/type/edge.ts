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

/** 工作流领域文档使用语义端口，运行时 Store 仍使用 handle 字符串。 */
export const ExecutionSourcePortRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('next'), nodeId: z.string().min(1) }),
  z.object({ kind: z.literal('branch'), nodeId: z.string().min(1), branchKey: z.string().min(1) }),
  z.object({
    kind: z.literal('sourceOutput'),
    nodeId: z.string().min(1),
    outputKey: z.string().min(1)
  }),
  z.object({ kind: z.literal('catch'), nodeId: z.string().min(1) }),
  z.object({ kind: z.literal('selectedTools'), nodeId: z.string().min(1) })
]);

export const ExecutionTargetPortRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('target'), nodeId: z.string().min(1) }),
  z.object({ kind: z.literal('selectedTools'), nodeId: z.string().min(1) })
]);

export const WorkflowExecutionEdgeSchema = z.object({
  source: ExecutionSourcePortRefSchema,
  target: ExecutionTargetPortRefSchema
});

export type ExecutionSourcePortRef = z.infer<typeof ExecutionSourcePortRefSchema>;
export type ExecutionTargetPortRef = z.infer<typeof ExecutionTargetPortRefSchema>;
export type WorkflowExecutionEdge = z.infer<typeof WorkflowExecutionEdgeSchema>;
