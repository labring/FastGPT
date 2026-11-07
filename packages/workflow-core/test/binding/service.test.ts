import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { applyWorkflowCommand } from '../../src/command/apply';
import { builtinTemplateProvider } from '../template/provider';
import { collectWorkflowBindings, getWorkflowBindingDiagnostics } from '../../src/binding/service';
import { createWorkflowDocument } from '../../src/domain/document';
import { parseNodeTemplateRef } from '../../src/template/type';
import { describe, expect, it } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

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
        code: WorkflowDiagnosticCodeEnum.bindingRequired,
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
        code: WorkflowDiagnosticCodeEnum.bindingUnverified,
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
        code: WorkflowDiagnosticCodeEnum.bindingRequired,
        severity: 'warning',
        nodeId: 'http',
        inputKey: 'system_httpReqUrl',
        params: { defaultPolicy: 'userRequired' }
      }
    ]);
  });

  it('uses runtime defaults to determine whether a binding is configured', () => {
    const document = createWorkflowDocument({
      nodes: [
        {
          nodeId: 'http',
          name: 'HTTP',
          flowNodeType: FlowNodeTypeEnum.httpRequest468,
          inputs: [
            {
              key: NodeInputKeyEnum.httpReqUrl,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              defaultValue: 'https://example.com'
            }
          ],
          outputs: []
        }
      ]
    });
    expect(collectWorkflowBindings(document)).toEqual([]);
    document.nodes[0].inputs[0].value = '';
    expect(collectWorkflowBindings(document)).toEqual([
      expect.objectContaining({
        nodeId: 'http',
        inputKey: NodeInputKeyEnum.httpReqUrl,
        status: 'missing'
      })
    ]);
  });
});
