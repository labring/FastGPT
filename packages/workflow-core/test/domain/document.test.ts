import {
  WORKFLOW_DOCUMENT_MIGRATION_GUIDANCE,
  WORKFLOW_DOCUMENT_SCHEMA_VERSION,
  WorkflowDocumentVersionError,
  createWorkflowDocument,
  parseCompatibleWorkflowDocument
} from '../../src';
import { describe, expect, it } from 'vitest';

describe('WorkflowDocument compatibility', () => {
  it('accepts the current schema version', () => {
    const document = createWorkflowDocument();
    expect(parseCompatibleWorkflowDocument(document).schemaVersion).toBe(
      WORKFLOW_DOCUMENT_SCHEMA_VERSION
    );
  });

  it.each([undefined, 'fastgpt-workflow/v0', 'fastgpt-workflow/v2'])(
    'rejects unsupported schemaVersion %s without silently rewriting it',
    (schemaVersion) => {
      const input = { ...createWorkflowDocument(), schemaVersion };
      expect(() => parseCompatibleWorkflowDocument(input)).toThrow(WorkflowDocumentVersionError);
      expect(WORKFLOW_DOCUMENT_MIGRATION_GUIDANCE).toContain('migrate one version at a time');
    }
  );
});
