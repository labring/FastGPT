import {
  WorkflowDocumentSchema,
  compileStoreWorkflow,
  decompileStoreWorkflow,
  getWorkflowChecksum,
  normalizeWorkflowDocument,
  validateWorkflow
} from '../../src';
import { WorkflowTemplateBasicTypeSchema } from '@fastgpt/global/core/workflow/type';
import aiStore from '../fixtures/basic-ai/store-workflow.json';
import aiWorkflow from '../fixtures/basic-ai/workflow.json';
import staticStore from '../fixtures/basic-static/store-workflow.json';
import staticWorkflow from '../fixtures/basic-static/workflow.json';
import commonLinearStore from '../fixtures/common-linear/store-workflow.json';
import commonLinearWorkflow from '../fixtures/common-linear/workflow.json';
import branchingStore from '../fixtures/branching/store-workflow.json';
import branchingWorkflow from '../fixtures/branching/workflow.json';
import toolCallToolsStore from '../fixtures/tool-call-tools/store-workflow.json';
import toolCallToolsWorkflow from '../fixtures/tool-call-tools/workflow.json';
import nestedLoopStore from '../fixtures/nested-loop/store-workflow.json';
import nestedLoopWorkflow from '../fixtures/nested-loop/workflow.json';
import dynamicIoCatchStore from '../fixtures/dynamic-io-catch/store-workflow.json';
import dynamicIoCatchWorkflow from '../fixtures/dynamic-io-catch/workflow.json';
import { describe, expect, it } from 'vitest';

describe('StoreWorkflow round-trip', () => {
  it.each([
    ['basic-ai', aiStore, aiWorkflow],
    ['basic-static', staticStore, staticWorkflow],
    ['common-linear', commonLinearStore, commonLinearWorkflow],
    ['branching', branchingStore, branchingWorkflow],
    ['tool-call-tools', toolCallToolsStore, toolCallToolsWorkflow],
    ['nested-loop', nestedLoopStore, nestedLoopWorkflow],
    ['dynamic-io-catch', dynamicIoCatchStore, dynamicIoCatchWorkflow]
  ])('preserves %s semantics', (_name, store, workflow) => {
    const parsedStore = WorkflowTemplateBasicTypeSchema.parse(store);
    const parsedWorkflow = WorkflowDocumentSchema.parse(workflow);
    const document = decompileStoreWorkflow({ workflow: parsedStore, app: parsedWorkflow.app });
    expect(compileStoreWorkflow(document)).toEqual(parsedStore);
    expect(normalizeWorkflowDocument(document)).toEqual(normalizeWorkflowDocument(parsedWorkflow));
    expect(validateWorkflow(document)).toEqual([]);
  });

  it('computes the same checksum regardless of node and edge order', async () => {
    const parsedWorkflow = WorkflowDocumentSchema.parse(aiWorkflow);
    const reversed = {
      ...parsedWorkflow,
      nodes: [...parsedWorkflow.nodes].reverse(),
      executionEdges: [...parsedWorkflow.executionEdges].reverse()
    };
    expect(await getWorkflowChecksum(parsedWorkflow)).toBe(await getWorkflowChecksum(reversed));
  });

  it('compiles semantic output keys to Store output ids and decompiles them back', () => {
    const document = WorkflowDocumentSchema.parse(commonLinearWorkflow);
    const answerInput = document.nodes
      .find((node) => node.nodeId === 'answer')!
      .inputs.find((input) => input.key === 'text')!;
    answerInput.value = ['code', 'result'];

    const requestUrlInput = document.nodes
      .find((node) => node.nodeId === 'http')!
      .inputs.find((input) => input.key === 'system_httpReqUrl')!;
    requestUrlInput.value = 'https://example.com/{{$code.result$}}';

    const store = compileStoreWorkflow(document);
    expect(
      store.nodes
        .find((node) => node.nodeId === 'answer')!
        .inputs.find((input) => input.key === 'text')!.value
    ).toEqual(['code', 'qLUQfhG0ILRX']);
    expect(
      store.nodes
        .find((node) => node.nodeId === 'http')!
        .inputs.find((input) => input.key === 'system_httpReqUrl')!.value
    ).toBe('https://example.com/{{$code.qLUQfhG0ILRX$}}');

    const roundTripDocument = decompileStoreWorkflow({ workflow: store });
    expect(
      roundTripDocument.nodes
        .find((node) => node.nodeId === 'answer')!
        .inputs.find((input) => input.key === 'text')!.value
    ).toEqual(['code', 'result']);
    expect(
      roundTripDocument.nodes
        .find((node) => node.nodeId === 'http')!
        .inputs.find((input) => input.key === 'system_httpReqUrl')!.value
    ).toBe('https://example.com/{{$code.result$}}');
  });
});
