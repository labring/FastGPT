import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import { WorkflowExecutionEdgeSchema } from '@fastgpt/global/core/workflow/type/edge';
import { WorkflowBuilderDocumentSchema } from '@fastgpt/global/openapi/core/workflow/builder/api';
import ai from '@fastgpt/workflow-core/test/fixtures/basic-ai/workflow.json';
import staticWorkflow from '@fastgpt/workflow-core/test/fixtures/basic-static/workflow.json';
import branching from '@fastgpt/workflow-core/test/fixtures/branching/workflow.json';
import linear from '@fastgpt/workflow-core/test/fixtures/common-linear/workflow.json';
import { describe, expect, it } from 'vitest';

describe('WorkflowDocumentSchema', () => {
  it.each([ai, staticWorkflow, branching, linear])(
    'keeps the API and domain parsing results identical for existing documents',
    (fixture) => {
      expect(WorkflowBuilderDocumentSchema.parse(fixture)).toEqual(
        WorkflowDocumentSchema.parse(fixture)
      );
    }
  );

  it('preserves domain stripping and strict API boundary behavior', () => {
    const input = { ...staticWorkflow, unexpected: true };
    expect(WorkflowDocumentSchema.parse(input)).not.toHaveProperty('unexpected');
    expect(WorkflowBuilderDocumentSchema.safeParse(input).success).toBe(false);

    const nested = { ...staticWorkflow, app: { name: 'Demo', unexpected: true } };
    expect(WorkflowDocumentSchema.parse(nested).app).toEqual({ name: 'Demo' });
    expect(WorkflowBuilderDocumentSchema.parse(nested).app).toEqual({ name: 'Demo' });
  });

  it.each([undefined, 'fastgpt-workflow/v0', 'fastgpt-workflow/v2'])(
    'rejects unsupported schema version %s at both boundaries',
    (schemaVersion) => {
      const input = { ...staticWorkflow, schemaVersion };
      expect(WorkflowDocumentSchema.safeParse(input).success).toBe(false);
      expect(WorkflowBuilderDocumentSchema.safeParse(input).success).toBe(false);
    }
  );
});

describe('WorkflowExecutionEdgeSchema', () => {
  it.each([
    { kind: 'next', nodeId: 'source' },
    { kind: 'branch', nodeId: 'source', branchKey: 'yes' },
    { kind: 'sourceOutput', nodeId: 'source', outputKey: 'result' },
    { kind: 'catch', nodeId: 'source' },
    { kind: 'selectedTools', nodeId: 'source' }
  ])('accepts existing source port $kind without changing its data', (source) => {
    for (const kind of ['target', 'selectedTools']) {
      const edge = { source, target: { kind, nodeId: 'target' } };
      expect(WorkflowExecutionEdgeSchema.parse(edge)).toEqual(edge);
    }
  });

  it.each([
    { kind: 'unknown', nodeId: 'source' },
    { kind: 'branch', nodeId: 'source' },
    { kind: 'branch', nodeId: 'source', branchKey: '' },
    { kind: 'sourceOutput', nodeId: 'source' },
    { kind: 'next', nodeId: '' }
  ])('rejects malformed semantic ports', (source) => {
    const input = {
      ...staticWorkflow,
      executionEdges: [{ source, target: { kind: 'target', nodeId: 'target' } }]
    };
    expect(WorkflowDocumentSchema.safeParse(input).success).toBe(false);
    expect(WorkflowBuilderDocumentSchema.safeParse(input).success).toBe(false);
  });
});
