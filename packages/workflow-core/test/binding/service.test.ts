import {
  applyWorkflowCommand,
  builtinTemplateProvider,
  collectWorkflowBindings,
  createWorkflowDocument,
  getWorkflowBindingDiagnostics,
  parseNodeTemplateRef
} from '../../src';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

describe('collectWorkflowBindings', () => {
  it('reports required and unverified bindings without exposing their values', async () => {
    const start = await applyWorkflowCommand({
      document: createWorkflowDocument(),
      command: {
        type: 'node.add',
        nodeId: 'start',
        template: parseNodeTemplateRef('builtin:workflow-start')
      },
      dependencies
    });
    const search = await applyWorkflowCommand({
      document: start.document,
      command: {
        type: 'node.add',
        nodeId: 'search',
        template: parseNodeTemplateRef('builtin:dataset-search'),
        connectFrom: { kind: 'next', nodeId: 'start' }
      },
      dependencies
    });

    const missingBindings = collectWorkflowBindings(search.document);
    expect(missingBindings).toEqual([
      {
        nodeId: 'search',
        inputKey: 'datasets',
        defaultPolicy: 'remoteValidated',
        resourceKind: 'dataset',
        status: 'missing'
      }
    ]);
    expect(getWorkflowBindingDiagnostics(missingBindings)).toEqual([
      {
        code: 'WORKFLOW_BINDING_REQUIRED',
        severity: 'warning',
        nodeId: 'search',
        inputKey: 'datasets',
        params: { defaultPolicy: 'remoteValidated', resourceKind: 'dataset' }
      }
    ]);

    const datasetInput = search.document.nodes
      .find((node) => node.nodeId === 'search')!
      .inputs.find((input) => input.key === 'datasets')!;
    datasetInput.value = [
      {
        datasetId: 'dataset-id',
        name: 'Dataset',
        avatar: '',
        vectorModel: { model: 'embedding-model' }
      }
    ];
    const bindings = collectWorkflowBindings(search.document);
    expect(bindings).toEqual([
      {
        nodeId: 'search',
        inputKey: 'datasets',
        defaultPolicy: 'remoteValidated',
        resourceKind: 'dataset',
        status: 'unverified'
      }
    ]);
    expect(JSON.stringify(bindings)).not.toContain('dataset-id');
    expect(getWorkflowBindingDiagnostics(bindings)).toEqual([
      {
        code: 'WORKFLOW_BINDING_UNVERIFIED',
        severity: 'warning',
        nodeId: 'search',
        inputKey: 'datasets',
        params: { defaultPolicy: 'remoteValidated', resourceKind: 'dataset' }
      }
    ]);
  });

  it('reports explicitly required user input but ignores optional secrets', async () => {
    const result = await applyWorkflowCommand({
      document: createWorkflowDocument(),
      command: {
        type: 'node.add',
        nodeId: 'http',
        template: parseNodeTemplateRef('builtin:http-request')
      },
      dependencies
    });

    const bindings = collectWorkflowBindings(result.document);
    expect(bindings).toEqual([
      {
        nodeId: 'http',
        inputKey: 'system_httpReqUrl',
        defaultPolicy: 'userRequired',
        resourceKind: undefined,
        status: 'missing'
      }
    ]);
    expect(getWorkflowBindingDiagnostics(bindings)).toEqual([
      {
        code: 'WORKFLOW_BINDING_REQUIRED',
        severity: 'warning',
        nodeId: 'http',
        inputKey: 'system_httpReqUrl',
        params: { defaultPolicy: 'userRequired' }
      }
    ]);
  });
});
