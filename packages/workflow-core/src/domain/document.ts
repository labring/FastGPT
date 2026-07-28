import { AppChatConfigTypeSchema } from '@fastgpt/global/core/app/type';
import { StoreNodeItemTypeSchema } from '@fastgpt/global/core/workflow/type/node';
import z from 'zod';
import { WorkflowExecutionEdgeSchema } from '../edge/type';

export const WORKFLOW_DOCUMENT_SCHEMA_VERSION = 'fastgpt-workflow/v1' as const;
export const WORKFLOW_DOCUMENT_SUPPORTED_SCHEMA_VERSIONS = [
  WORKFLOW_DOCUMENT_SCHEMA_VERSION
] as const;
export const WORKFLOW_DOCUMENT_MIGRATION_GUIDANCE =
  'Use a CLI version that supports the source schema, migrate one version at a time, and never remove or rewrite schemaVersion manually.';

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

export class WorkflowDocumentVersionError extends Error {
  readonly code = 'WORKFLOW_DOCUMENT_VERSION_UNSUPPORTED';

  constructor(readonly foundVersion: string | undefined) {
    super(
      foundVersion === undefined
        ? 'workflow.json is missing schemaVersion'
        : `Unsupported workflow schemaVersion: ${foundVersion}`
    );
    this.name = 'WorkflowDocumentVersionError';
  }
}

/**
 * 解析版本化工作流文档。当前没有历史迁移器，因此只接受 v1，并为缺失、旧版或新版文档返回明确迁移指引。
 */
export const parseCompatibleWorkflowDocument = (input: unknown): WorkflowDocument => {
  const schemaVersion =
    input && typeof input === 'object' && !Array.isArray(input) && 'schemaVersion' in input
      ? (input as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (schemaVersion !== WORKFLOW_DOCUMENT_SCHEMA_VERSION) {
    throw new WorkflowDocumentVersionError(
      typeof schemaVersion === 'string' ? schemaVersion : undefined
    );
  }
  return WorkflowDocumentSchema.parse(input);
};

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
