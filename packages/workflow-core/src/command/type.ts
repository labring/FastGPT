import z from 'zod';
import { ExecutionSourcePortRefSchema } from '../edge/type';
import { VariableRefSchema } from '../reference/type';
import { NodeTemplateRefSchema } from '../template/type';
import { WorkflowExecutionEdgeSchema } from '../edge/type';
import { VariableItemTypeSchema } from '@fastgpt/global/core/app/type';
import {
  FlowNodeInputItemTypeSchema,
  FlowNodeOutputItemTypeSchema
} from '@fastgpt/global/core/workflow/type/io';
import { WorkflowDiagnosticSchema } from '../domain/diagnostic';

const NodeAddCommandSchema = z.object({
  type: z.literal('node.add'),
  nodeId: z.string().min(1),
  template: NodeTemplateRefSchema,
  name: z.string().min(1).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  parentNodeId: z.string().min(1).optional(),
  connectFrom: ExecutionSourcePortRefSchema.optional(),
  inputOverrides: z.record(z.string(), z.unknown()).optional()
});

const InputSetCommandSchema = z.object({
  type: z.literal('input.set'),
  nodeId: z.string().min(1),
  inputKey: z.string().min(1),
  value: z.any()
});

const InputRefCommandSchema = z.object({
  type: z.literal('input.ref'),
  nodeId: z.string().min(1),
  inputKey: z.string().min(1),
  ref: VariableRefSchema
});

const PositionSchema = z.object({ x: z.number(), y: z.number() });

const NodeUpdateCommandSchema = z.object({
  type: z.literal('node.update'),
  nodeId: z.string().min(1),
  name: z.string().min(1).optional(),
  position: PositionSchema.optional(),
  catchError: z.boolean().optional()
});

const NodeMoveCommandSchema = z
  .object({
    type: z.literal('node.move'),
    nodeId: z.string().min(1),
    position: PositionSchema.optional(),
    parentNodeId: z.string().min(1).nullable().optional()
  })
  .refine((value) => value.position !== undefined || value.parentNodeId !== undefined);

const NodeInsertCommandSchema = z.object({
  type: z.literal('node.insert'),
  nodeId: z.string().min(1),
  template: NodeTemplateRefSchema,
  from: ExecutionSourcePortRefSchema,
  to: z.object({ kind: z.literal('target'), nodeId: z.string().min(1) }),
  position: PositionSchema.optional()
});

const NodeCloneCommandSchema = z.object({
  type: z.literal('node.clone'),
  sourceNodeId: z.string().min(1),
  nodeId: z.string().min(1),
  position: PositionSchema.optional(),
  offset: PositionSchema.optional()
});

const NodeRemoveCommandSchema = z.object({
  type: z.literal('node.remove'),
  nodeId: z.string().min(1)
});

const EdgeConnectCommandSchema = z.object({
  type: z.literal('edge.connect'),
  edge: WorkflowExecutionEdgeSchema
});

const EdgeDisconnectCommandSchema = z.object({
  type: z.literal('edge.disconnect'),
  edge: WorkflowExecutionEdgeSchema
});

const EdgeReconnectCommandSchema = z.object({
  type: z.literal('edge.reconnect'),
  oldEdge: WorkflowExecutionEdgeSchema,
  newEdge: WorkflowExecutionEdgeSchema
});

const InputUnsetCommandSchema = z.object({
  type: z.literal('input.unset'),
  nodeId: z.string().min(1),
  inputKey: z.string().min(1)
});

const InputAddCommandSchema = z.object({
  type: z.literal('input.add'),
  nodeId: z.string().min(1),
  input: FlowNodeInputItemTypeSchema
});

const InputRemoveCommandSchema = z.object({
  type: z.literal('input.remove'),
  nodeId: z.string().min(1),
  inputKey: z.string().min(1)
});

const OutputAddCommandSchema = z.object({
  type: z.literal('output.add'),
  nodeId: z.string().min(1),
  output: FlowNodeOutputItemTypeSchema
});

const OutputRemoveCommandSchema = z.object({
  type: z.literal('output.remove'),
  nodeId: z.string().min(1),
  outputKey: z.string().min(1)
});

const ToolAttachCommandSchema = z
  .object({
    type: z.literal('tool.attach'),
    toolCallNodeId: z.string().min(1),
    toolNodeId: z.string().min(1).optional(),
    template: NodeTemplateRefSchema.optional(),
    newNodeId: z.string().min(1).optional(),
    position: PositionSchema.optional()
  })
  .superRefine((value, context) => {
    const usesExistingNode = value.toolNodeId !== undefined;
    const createsNode = value.template !== undefined || value.newNodeId !== undefined;
    if (
      usesExistingNode === createsNode ||
      (createsNode && (!value.template || !value.newNodeId))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Use either toolNodeId or template with newNodeId'
      });
    }
  });

const ToolDetachCommandSchema = z.object({
  type: z.literal('tool.detach'),
  toolCallNodeId: z.string().min(1),
  toolNodeId: z.string().min(1)
});

const MetaUpdateCommandSchema = z.object({
  type: z.literal('meta.update'),
  name: z.string().min(1).optional(),
  intro: z.string().optional()
});

const ConfigSetCommandSchema = z.object({
  type: z.literal('config.set'),
  path: z.string().min(1),
  value: z.any()
});

const ConfigUnsetCommandSchema = z.object({
  type: z.literal('config.unset'),
  path: z.string().min(1)
});

const VariableAddCommandSchema = z.object({
  type: z.literal('variable.add'),
  variable: VariableItemTypeSchema
});

const VariableUpdateCommandSchema = z.object({
  type: z.literal('variable.update'),
  key: z.string().min(1),
  patch: VariableItemTypeSchema.partial()
});

const VariableRemoveCommandSchema = z.object({
  type: z.literal('variable.remove'),
  key: z.string().min(1)
});

export const WorkflowCommandSchema = z.discriminatedUnion('type', [
  NodeAddCommandSchema,
  NodeUpdateCommandSchema,
  NodeMoveCommandSchema,
  NodeInsertCommandSchema,
  NodeCloneCommandSchema,
  NodeRemoveCommandSchema,
  EdgeConnectCommandSchema,
  EdgeDisconnectCommandSchema,
  EdgeReconnectCommandSchema,
  InputSetCommandSchema,
  InputRefCommandSchema,
  InputUnsetCommandSchema,
  InputAddCommandSchema,
  InputRemoveCommandSchema,
  OutputAddCommandSchema,
  OutputRemoveCommandSchema,
  ToolAttachCommandSchema,
  ToolDetachCommandSchema,
  MetaUpdateCommandSchema,
  ConfigSetCommandSchema,
  ConfigUnsetCommandSchema,
  VariableAddCommandSchema,
  VariableUpdateCommandSchema,
  VariableRemoveCommandSchema
]);

export type WorkflowCommand = z.infer<typeof WorkflowCommandSchema>;

const workflowCommandTypes = new Set<string>(
  WorkflowCommandSchema.options.map((option) => option.shape.type.value)
);
export const WorkflowCommandTypeSchema = z.custom<WorkflowCommand['type']>(
  (value) => typeof value === 'string' && workflowCommandTypes.has(value)
);

export const WorkflowChangeSummarySchema = z.object({
  type: WorkflowCommandTypeSchema,
  nodeId: z.string().optional(),
  inputKey: z.string().optional(),
  path: z.string().optional(),
  key: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional()
});

export type WorkflowChangeSummary = z.infer<typeof WorkflowChangeSummarySchema>;

export const WORKFLOW_CHANGESET_SCHEMA_VERSION = 'fastgpt-workflow-changeset/v1' as const;
export const WORKFLOW_PLAN_SCHEMA_VERSION = 'fastgpt-workflow-plan/v1' as const;

const WorkflowChecksumSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const WorkflowChangeSetSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_CHANGESET_SCHEMA_VERSION),
    baseChecksum: WorkflowChecksumSchema,
    commands: z.array(WorkflowCommandSchema).min(1)
  })
  .strict();

export type WorkflowChangeSet = z.infer<typeof WorkflowChangeSetSchema>;

export const WorkflowPlanSchema = z
  .object({
    schemaVersion: z.literal(WORKFLOW_PLAN_SCHEMA_VERSION),
    baseChecksum: WorkflowChecksumSchema,
    targetChecksum: WorkflowChecksumSchema,
    changeSet: WorkflowChangeSetSchema,
    changes: z.array(WorkflowChangeSummarySchema),
    diagnostics: z.array(WorkflowDiagnosticSchema)
  })
  .strict()
  .refine((plan) => plan.baseChecksum === plan.changeSet.baseChecksum, {
    message: 'Plan baseChecksum must match ChangeSet baseChecksum',
    path: ['baseChecksum']
  });

export type WorkflowPlan = z.infer<typeof WorkflowPlanSchema>;
