import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  WORKFLOW_DOCUMENT_SCHEMA_VERSION,
  WorkflowDocumentSchema,
  type WorkflowDocument
} from '@fastgpt/global/core/workflow/type/document';

export const WORKFLOW_DOCUMENT_MIGRATION_GUIDANCE =
  'Use a CLI version that supports the source schema, migrate one version at a time, and never remove or rewrite schemaVersion manually.';

export class WorkflowDocumentVersionError extends Error {
  readonly code = WorkflowDiagnosticCodeEnum.documentVersionUnsupported;

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
