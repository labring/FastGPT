import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import { applyWorkflowCommand } from '../../src/command/apply';
import { assertExecutionConnection } from '../../src/edge/validation';
import { WorkflowCommandError } from '../../src/domain/diagnostic';
import { builtinTemplateProvider } from '../template/provider';
import fixture from '../fixtures/basic-static/workflow.json';
import { describe, expect, it } from 'vitest';

describe('assertExecutionConnection', () => {
  it('checks the same connection as the write command without modifying the document', async () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const edge = document.executionEdges.shift()!;
    const before = structuredClone(document);
    expect(assertExecutionConnection({ document, edge })).toBeUndefined();
    expect(document).toEqual(before);
    const result = await applyWorkflowCommand({
      document,
      command: { type: 'edge.connect', edge },
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    expect(result.document.executionEdges.at(-1)).toEqual(edge);
    expect(document).toEqual(before);
  });

  it('rejects duplicate and self connections without modifying the document', () => {
    const document = WorkflowDocumentSchema.parse(fixture);
    const before = structuredClone(document);
    expect(() => assertExecutionConnection({ document, edge: document.executionEdges[0] })).toThrow(
      'WORKFLOW_EDGE_DUPLICATED'
    );
    expect(() =>
      assertExecutionConnection({
        document,
        edge: {
          source: { kind: 'next', nodeId: 'text' },
          target: { kind: 'target', nodeId: 'text' }
        }
      })
    ).toThrow(WorkflowCommandError);
    expect(document).toEqual(before);
  });
});
