import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import z from 'zod';
import { WorkflowExecutionEdgeSchema } from '../edge/type';

export const WORKFLOW_DOCUMENT_SCHEMA_VERSION = 'fastgpt-workflow/v1' as const;

export const WorkflowDocumentSchema = z.object({
  schemaVersion: z.literal(WORKFLOW_DOCUMENT_SCHEMA_VERSION),
  app: z.object({
    appId: z.string().optional(),
    name: z.string().optional(),
    intro: z.string().optional(),
    appType: z.string().optional(),
    baseVersionId: z.string().optional()
  }),
  nodes: z.array(StoreNodeItemTypeSchema),
  executionEdges: z.array(WorkflowExecutionEdgeSchema),
  chatConfig: AppChatConfigTypeSchema
});

export type WorkflowDocument = z.infer<typeof WorkflowDocumentSchema>;

export const createWorkflowDocument = (
  input: Partial<Pick<WorkflowDocument, 'app' | 'nodes' | 'executionEdges' | 'chatConfig'>> = {}
): WorkflowDocument =>
  WorkflowDocumentSchema.parse({
    schemaVersion: WORKFLOW_DOCUMENT_SCHEMA_VERSION,
    app: input.app ?? {},
    nodes: input.nodes ?? [],
    executionEdges: input.executionEdges ?? [],
    chatConfig: input.chatConfig ?? {}
  });
