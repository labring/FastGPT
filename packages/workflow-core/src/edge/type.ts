import z from 'zod';

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
