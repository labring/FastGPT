import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowCommandError } from '../../src/domain/diagnostic';
import { WorkflowIOValueTypeEnum, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { applyWorkflowCommand } from '../../src/command/apply';
import { builtinTemplateProvider } from '../template/provider';
import { compileStoreWorkflow } from '../../src/store/compile';
import { createWorkflowDocument } from '../../src/domain/document';
import { decompileStoreWorkflow } from '../../src/store/decompile';
import { parseNodeTemplateRef } from '../../src/template/type';
import { describe, expect, it } from 'vitest';
import { validateWorkflow } from '../../src/validation';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };

const addNode = async ({
  document,
  nodeId,
  template,
  after
}: {
  document: ReturnType<typeof createWorkflowDocument>;
  nodeId: string;
  template: string;
  after?: string;
}) =>
  (
    await applyWorkflowCommand({
      document,
      command: {
        type: 'node.add',
        nodeId,
        template: parseNodeTemplateRef(template),
        connectFrom: after ? { kind: 'next', nodeId: after } : undefined
      },
      dependencies
    })
  ).document;

describe('additional builtin nodes', () => {
  /** 从仍可解析的旧模板还原历史节点，避免通过新建入口绕过弃用规则。 */
  const createLegacyQueryDocument = async () => {
    const document = await addNode({
      document: createWorkflowDocument(),
      nodeId: 'start',
      template: 'builtin:workflow-start'
    });
    const { template } = await builtinTemplateProvider.resolve(
      parseNodeTemplateRef('builtin:question-optimization'),
      { locale: 'en' }
    );
    const legacyDocument = createWorkflowDocument({
      nodes: [...document.nodes, { ...template, nodeId: 'legacy-query' }],
      executionEdges: [
        {
          source: { kind: 'next', nodeId: 'start' },
          target: { kind: 'target', nodeId: 'legacy-query' }
        }
      ]
    });
    return (
      await applyWorkflowCommand({
        document: legacyDocument,
        command: {
          type: 'input.ref',
          nodeId: 'legacy-query',
          inputKey: 'userChatInput',
          ref: { nodeId: 'start', outputKey: 'userChatInput' }
        },
        dependencies
      })
    ).document;
  };

  it('rejects deprecated builtin templates when creating a new node', async () => {
    await expect(
      applyWorkflowCommand({
        document: createWorkflowDocument(),
        command: {
          type: 'node.add',
          nodeId: 'query-extension',
          template: parseNodeTemplateRef('builtin:question-optimization')
        },
        dependencies
      })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.templateNotAvailableForBuilder })
      ]
    });
  });

  it('rejects inserting a deprecated template without changing the existing edge', async () => {
    const document = await createLegacyQueryDocument();
    const before = structuredClone(document);

    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'node.insert',
          nodeId: 'new-query',
          template: parseNodeTemplateRef('builtin:question-optimization'),
          from: { kind: 'next', nodeId: 'start' },
          to: { kind: 'target', nodeId: 'legacy-query' }
        },
        dependencies
      })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.templateNotAvailableForBuilder })
      ]
    });
    expect(document).toEqual(before);
  });

  it('rejects cloning a deprecated historical node without changing the document', async () => {
    const document = await createLegacyQueryDocument();
    const before = structuredClone(document);

    await expect(
      applyWorkflowCommand({
        document,
        command: { type: 'node.clone', sourceNodeId: 'legacy-query', nodeId: 'new-query' },
        dependencies
      })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.templateNotAvailableForBuilder,
          nodeId: 'legacy-query'
        })
      ]
    });
    expect(document).toEqual(before);
  });

  it('keeps historical deprecated nodes editable and compatible with stored workflows', async () => {
    const document = await createLegacyQueryDocument();
    const result = await applyWorkflowCommand({
      document,
      command: { type: 'node.update', nodeId: 'legacy-query', name: '保留的历史问题优化' },
      dependencies
    });

    expect(result.document.nodes.find((node) => node.nodeId === 'legacy-query')).toMatchObject({
      name: '保留的历史问题优化',
      flowNodeType: 'cfr'
    });
    expect(validateWorkflow(result.document, { invalidReferencePolicy: 'error' })).toEqual([]);
    const workflow = compileStoreWorkflow(result.document);
    expect(compileStoreWorkflow(decompileStoreWorkflow({ workflow }))).toEqual(workflow);
  });

  it('keeps call-app available for creation and cloning', async () => {
    const document = await addNode({
      document: createWorkflowDocument(),
      nodeId: 'call-app',
      template: 'builtin:call-app'
    });
    const result = await applyWorkflowCommand({
      document,
      command: { type: 'node.clone', sourceNodeId: 'call-app', nodeId: 'call-app-copy' },
      dependencies
    });

    expect(
      result.document.nodes.find((node) => node.nodeId === 'call-app-copy')?.flowNodeType
    ).toBe(document.nodes[0].flowNodeType);
  });

  it.each([
    {
      toolConfig: {
        mcpToolSet: {
          url: 'https://example.com/mcp',
          toolList: [],
          headerSecret: { Authorization: { value: 'clone-test-secret' } }
        }
      }
    },
    {
      toolConfig: {
        httpToolSet: {
          toolList: [],
          headerSecret: { Authorization: { value: 'clone-test-secret' } }
        }
      }
    }
  ])(
    'keeps external tool nodes cloneable without copying credentials: $toolConfig',
    async ({ toolConfig }) => {
      const document = createWorkflowDocument({
        nodes: [
          {
            nodeId: 'external-tool',
            name: 'External tool',
            flowNodeType: FlowNodeTypeEnum.toolSet,
            position: { x: 100, y: 200 },
            inputs: [
              {
                key: 'apiKey',
                label: 'API key',
                renderTypeList: [FlowNodeInputTypeEnum.password],
                value: 'clone-test-secret'
              },
              {
                key: NodeInputKeyEnum.headerSecret,
                label: 'Headers',
                renderTypeList: [FlowNodeInputTypeEnum.hidden],
                value: { Authorization: { value: 'clone-test-secret' } }
              }
            ],
            outputs: [],
            toolConfig
          }
        ]
      });
      const result = await applyWorkflowCommand({
        document,
        command: {
          type: 'node.clone',
          sourceNodeId: 'external-tool',
          nodeId: 'external-tool-copy',
          offset: { x: 20, y: 30 }
        },
        dependencies
      });
      const copy = result.document.nodes.find((node) => node.nodeId === 'external-tool-copy');

      expect(copy).toMatchObject({
        flowNodeType: FlowNodeTypeEnum.toolSet,
        position: { x: 120, y: 230 }
      });
      expect(copy?.inputs.map((input) => input.value)).toEqual([undefined, undefined]);
      expect(JSON.stringify(copy)).not.toContain('clone-test-secret');
      expect(JSON.stringify(document)).toContain('clone-test-secret');
    }
  );

  it('configures dataset concat through generic dynamic input commands', async () => {
    let document = await addNode({
      document: createWorkflowDocument(),
      nodeId: 'start',
      template: 'builtin:workflow-start'
    });
    document = await addNode({
      document,
      nodeId: 'search',
      template: 'builtin:dataset-search',
      after: 'start'
    });
    document = await addNode({
      document,
      nodeId: 'concat',
      template: 'builtin:dataset-concat',
      after: 'search'
    });
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.add',
          nodeId: 'concat',
          input: {
            key: 'quote_1',
            label: 'Quote 1',
            valueType: WorkflowIOValueTypeEnum.datasetQuote,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            required: true,
            canEdit: true
          }
        },
        dependencies
      })
    ).document;
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.ref',
          nodeId: 'concat',
          inputKey: 'quote_1',
          ref: { nodeId: 'search', outputKey: 'quoteQA' }
        },
        dependencies
      })
    ).document;

    expect(document.nodes.find((node) => node.nodeId === 'concat')?.inputs).toContainEqual(
      expect.objectContaining({
        key: 'quote_1',
        value: ['search', 'quoteQA'],
        canEdit: true
      })
    );
    const storeWorkflow = compileStoreWorkflow(document);
    expect(compileStoreWorkflow(decompileStoreWorkflow({ workflow: storeWorkflow }))).toEqual(
      storeWorkflow
    );

    const removed = await applyWorkflowCommand({
      document,
      command: { type: 'input.remove', nodeId: 'concat', inputKey: 'quote_1' },
      dependencies
    });
    expect(
      removed.document.nodes
        .find((node) => node.nodeId === 'concat')
        ?.inputs.some((input) => input.key === 'quote_1')
    ).toBe(false);
    await expect(
      applyWorkflowCommand({
        document,
        command: {
          type: 'input.remove',
          nodeId: 'concat',
          inputKey: 'system_datasetQuoteList'
        },
        dependencies
      })
    ).rejects.toThrow(WorkflowCommandError);
  });

  it('creates and configures custom feedback through the standard input command', async () => {
    let document = await addNode({
      document: createWorkflowDocument(),
      nodeId: 'start',
      template: 'builtin:workflow-start'
    });
    document = await addNode({
      document,
      nodeId: 'feedback',
      template: 'builtin:custom-feedback',
      after: 'start'
    });
    document = (
      await applyWorkflowCommand({
        document,
        command: {
          type: 'input.set',
          nodeId: 'feedback',
          inputKey: 'system_textareaInput',
          value: 'Accurate answer'
        },
        dependencies
      })
    ).document;
    expect(document.nodes.find((node) => node.nodeId === 'feedback')).toMatchObject({
      flowNodeType: 'customFeedback',
      inputs: [expect.objectContaining({ value: 'Accurate answer' })]
    });
  });

  it.each(['custom-feedback', 'http-request'])(
    'rejects new dynamic inputs on builtin:%s without an active dynamic input marker',
    async (templateId) => {
      let document = await addNode({
        document: createWorkflowDocument(),
        nodeId: 'start',
        template: 'builtin:workflow-start'
      });
      document = await addNode({
        document,
        nodeId: 'feedback',
        template: `builtin:${templateId}`,
        after: 'start'
      });
      await expect(
        applyWorkflowCommand({
          document,
          command: {
            type: 'input.add',
            nodeId: 'feedback',
            input: {
              key: 'extra',
              label: 'Extra',
              valueType: WorkflowIOValueTypeEnum.string,
              renderTypeList: [FlowNodeInputTypeEnum.input],
              canEdit: true
            }
          },
          dependencies
        })
      ).rejects.toThrow(WorkflowCommandError);
    }
  );
});
