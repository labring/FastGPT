import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { WorkflowDocumentSchema } from '../../src';
import {
  decodeWorkflowNodeReferences,
  encodeWorkflowNodeReferences
} from '../../src/reference/codec';
import commonLinearWorkflow from '../fixtures/common-linear/workflow.json';
import { describe, expect, it } from 'vitest';

describe('workflow reference codec', () => {
  const createNodes = () => {
    const document = WorkflowDocumentSchema.parse(commonLinearWorkflow);
    const answerInput = document.nodes
      .find((node) => node.nodeId === 'answer')!
      .inputs.find((input) => input.key === 'text')!;
    answerInput.value = ['code', 'result'];

    const httpHeaderInput = document.nodes
      .find((node) => node.nodeId === 'http')!
      .inputs.find((input) => input.key === 'system_httpHeader')!;
    httpHeaderInput.value = [
      {
        key: 'x-result',
        value:
          'Result: {{$code.result$}}; Global: {{$VARIABLE_NODE_ID.globalResult$}}; Missing: {{$missing.result$}}',
        nested: {
          refs: [
            ['code', 'result'],
            [VARIABLE_NODE_ID, 'globalResult'],
            ['missing', 'result']
          ]
        }
      }
    ];
    return document.nodes;
  };

  it('encodes output keys recursively without mutating the document nodes', () => {
    const nodes = createNodes();
    const encodedNodes = encodeWorkflowNodeReferences(nodes);
    const encodedAnswerInput = encodedNodes
      .find((node) => node.nodeId === 'answer')!
      .inputs.find((input) => input.key === 'text')!;
    const encodedHeaders = encodedNodes
      .find((node) => node.nodeId === 'http')!
      .inputs.find((input) => input.key === 'system_httpHeader')!.value as Array<{
      value: string;
      nested: { refs: string[][] };
    }>;

    expect(encodedAnswerInput.value).toEqual(['code', 'qLUQfhG0ILRX']);
    expect(encodedHeaders[0].value).toBe(
      'Result: {{$code.qLUQfhG0ILRX$}}; Global: {{$VARIABLE_NODE_ID.globalResult$}}; Missing: {{$missing.result$}}'
    );
    expect(encodedHeaders[0].nested.refs).toEqual([
      ['code', 'qLUQfhG0ILRX'],
      [VARIABLE_NODE_ID, 'globalResult'],
      ['missing', 'result']
    ]);
    expect(
      nodes.find((node) => node.nodeId === 'answer')!.inputs.find((input) => input.key === 'text')!
        .value
    ).toEqual(['code', 'result']);
  });

  it('decodes output ids back to stable output keys', () => {
    const nodes = createNodes();
    expect(decodeWorkflowNodeReferences(encodeWorkflowNodeReferences(nodes))).toEqual(nodes);
  });
});
