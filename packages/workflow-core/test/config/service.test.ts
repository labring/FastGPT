import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import {
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum
} from '@fastgpt/global/core/dataset/constants';
import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { applyWorkflowCommand } from '../../src/command/apply';
import { builtinTemplateProvider } from '../template/provider';
import { createWorkflowDocument } from '../../src/domain/document';
import { getChatConfigDescriptor, listChatConfigDescriptors } from '../../src/config/descriptor';
import { parseNodeTemplateRef } from '../../src/template/type';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider, locale: 'en' };
const apply = async (
  document: ReturnType<typeof createWorkflowDocument>,
  command: Parameters<typeof applyWorkflowCommand>[0]['command']
) => applyWorkflowCommand({ document, command, dependencies });

const createDocument = async () =>
  (
    await apply(createWorkflowDocument(), {
      type: 'node.add',
      nodeId: 'start',
      template: parseNodeTemplateRef('builtin:workflow-start')
    })
  ).document;

const createDocumentWithVariableReferenceArray = async () => {
  let document = await createDocument();
  document = (
    await apply(document, {
      type: 'config.set',
      path: 'fileSelectConfig',
      value: { canSelectFile: true }
    })
  ).document;
  document = (
    await apply(document, {
      type: 'node.add',
      nodeId: 'read',
      template: parseNodeTemplateRef('builtin:read-files'),
      connectFrom: { kind: 'next', nodeId: 'start' }
    })
  ).document;
  document = (
    await apply(document, {
      type: 'variable.add',
      variable: {
        key: 'tenantId',
        label: 'Tenant ID',
        description: 'Current tenant',
        type: VariableInputEnum.input,
        valueType: WorkflowIOValueTypeEnum.string,
        required: true
      }
    })
  ).document;

  const input = document.nodes
    .find((node) => node.nodeId === 'read')
    ?.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList);
  if (!input) throw new Error('Read files input is unavailable');
  input.value = [
    [VARIABLE_NODE_ID, 'tenantId'],
    ['start', NodeOutputKeyEnum.userFiles]
  ];

  return document;
};

describe('ChatConfig descriptors', () => {
  it('exposes Agent guidance, value schema, capabilities and current value', () => {
    const document = createWorkflowDocument({
      chatConfig: { fileSelectConfig: { maxFiles: 1, canSelectFile: true } }
    });
    const descriptor = getChatConfigDescriptor({
      document,
      path: 'fileSelectConfig',
      translate: (value) =>
        value === 'workflow:cli.config.file_select' ? 'Enable user file input' : value
    });

    expect(descriptor).toMatchObject({
      path: 'fileSelectConfig',
      description: 'Enable user file input',
      capabilities: ['user-file-input'],
      value: { maxFiles: 1, canSelectFile: true },
      valueSchema: {
        type: 'object',
        properties: {
          maxFiles: expect.objectContaining({ type: expect.stringMatching(/^(integer|number)$/) }),
          canSelectFile: expect.objectContaining({ type: 'boolean' })
        }
      }
    });
  });

  it('returns one descriptor for every allowlisted configuration path', () => {
    const descriptors = listChatConfigDescriptors({ document: createWorkflowDocument() });

    expect(descriptors).toHaveLength(17);
    expect(descriptors.every(({ description }) => description.length > 0)).toBe(true);
    expect(descriptors.find(({ path }) => path === 'autoExecute.open')?.valueSchema).toMatchObject({
      type: 'boolean'
    });
  });

  it('supports generated welcome questions without replacing the welcome text', async () => {
    const document = createWorkflowDocument({
      chatConfig: { welcomeConfig: { welcomeText: '欢迎使用', welcomeQuestions: ['旧问题'] } }
    });
    const descriptor = getChatConfigDescriptor({
      document,
      path: 'welcomeConfig.welcomeQuestions'
    });

    expect(descriptor.value).toEqual(['旧问题']);
    expect(descriptor.valueSchema).toMatchObject({ type: 'array' });

    const result = await apply(document, {
      type: 'config.set',
      path: 'welcomeConfig.welcomeQuestions',
      value: ['新问题一', '新问题二']
    });

    expect(result.document.chatConfig.welcomeConfig).toEqual({
      welcomeText: '欢迎使用',
      welcomeQuestions: ['新问题一', '新问题二']
    });
  });

  it.each([
    { value: '完整问题' },
    { value: ['完整问题', 1] },
    { value: [null] },
    { value: [{ question: '完整问题' }] }
  ])(
    'rejects invalid welcome question values without changing existing configuration: $value',
    async ({ value }) => {
      const document = createWorkflowDocument({
        chatConfig: { welcomeConfig: { welcomeText: '欢迎使用', welcomeQuestions: ['原问题'] } }
      });
      const before = structuredClone(document);

      await expect(
        apply(document, { type: 'config.set', path: 'welcomeConfig.welcomeQuestions', value })
      ).rejects.toThrow();
      expect(document).toEqual(before);
    }
  );
});

describe('fileSelectConfig output synchronization', () => {
  it.each([
    'canSelectFile',
    'canSelectImg',
    'canSelectVideo',
    'canSelectAudio',
    'canSelectCustomFileExtension'
  ] as const)('adds one userFiles output when %s is enabled', async (key) => {
    let document = await createDocument();
    document = (
      await apply(document, {
        type: 'config.set',
        path: 'fileSelectConfig',
        value: { [key]: true }
      })
    ).document;
    document = (
      await apply(document, {
        type: 'config.set',
        path: 'fileSelectConfig',
        value: { [key]: true, maxFiles: 1 }
      })
    ).document;

    expect(
      document.nodes
        .find((node) => node.nodeId === 'start')
        ?.outputs.filter((output) => output.key === NodeOutputKeyEnum.userFiles)
    ).toHaveLength(1);
  });

  it('keeps file output available when configuration is applied before Start creation', async () => {
    let document = createWorkflowDocument();
    document = (
      await apply(document, {
        type: 'config.set',
        path: 'fileSelectConfig',
        value: { canSelectFile: true, maxFiles: 1 }
      })
    ).document;
    document = (
      await apply(document, {
        type: 'node.add',
        nodeId: 'start',
        template: parseNodeTemplateRef('builtin:workflow-start')
      })
    ).document;
    document = (
      await apply(document, {
        type: 'node.add',
        nodeId: 'read',
        template: parseNodeTemplateRef('builtin:read-files'),
        connectFrom: { kind: 'next', nodeId: 'start' }
      })
    ).document;

    const start = document.nodes.find((node) => node.nodeId === 'start');
    const readFiles = document.nodes.find((node) => node.nodeId === 'read');
    expect(start?.outputs.some((output) => output.key === NodeOutputKeyEnum.userFiles)).toBe(true);
    expect(
      readFiles?.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)?.value
    ).toEqual([['start', NodeOutputKeyEnum.userFiles]]);
  });

  it('removes an unreferenced userFiles output when file upload is disabled or unset', async () => {
    let document = await createDocument();
    document = (
      await apply(document, {
        type: 'config.set',
        path: 'fileSelectConfig',
        value: { canSelectFile: true }
      })
    ).document;
    document = (
      await apply(document, {
        type: 'config.set',
        path: 'fileSelectConfig',
        value: { canSelectFile: false }
      })
    ).document;
    expect(
      document.nodes[0].outputs.some((output) => output.key === NodeOutputKeyEnum.userFiles)
    ).toBe(false);

    document = (
      await apply(document, {
        type: 'config.set',
        path: 'fileSelectConfig',
        value: { canSelectFile: true }
      })
    ).document;
    document = (await apply(document, { type: 'config.unset', path: 'fileSelectConfig' })).document;
    expect(document.chatConfig.fileSelectConfig).toBeUndefined();
    expect(
      document.nodes[0].outputs.some((output) => output.key === NodeOutputKeyEnum.userFiles)
    ).toBe(false);
  });

  it('atomically blocks disabling file upload while userFiles is referenced', async () => {
    let document = await createDocument();
    document = (
      await apply(document, {
        type: 'config.set',
        path: 'fileSelectConfig',
        value: { canSelectFile: true }
      })
    ).document;
    document = (
      await apply(document, {
        type: 'node.add',
        nodeId: 'read',
        template: parseNodeTemplateRef('builtin:read-files'),
        connectFrom: { kind: 'next', nodeId: 'start' }
      })
    ).document;

    const before = structuredClone(document);
    await expect(
      apply(document, {
        type: 'config.set',
        path: 'fileSelectConfig',
        value: { canSelectFile: false }
      })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.fileOutputStillReferenced,
          nodeId: 'start'
        })
      ]
    });
    expect(document).toEqual(before);
  });
});

describe('global variable references', () => {
  it('auto-generates a unique key when variable.add omits key and rejects changing key on update', async () => {
    const document = await createDocument();
    const added = await apply(document, {
      type: 'variable.add',
      variable: {
        label: 'GitHub Org',
        description: '',
        type: VariableInputEnum.input,
        valueType: WorkflowIOValueTypeEnum.string,
        required: true
      }
    });

    const created = added.document.chatConfig.variables?.[0];
    expect(created?.key).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(added.changes).toEqual([{ type: 'variable.add', key: created?.key }]);

    const updated = await apply(added.document, {
      type: 'variable.update',
      key: created!.key,
      patch: { label: 'GitHub Account' }
    });
    expect(updated.document.chatConfig.variables?.[0]).toMatchObject({
      key: created!.key,
      label: 'GitHub Account'
    });

    await expect(
      apply(updated.document, {
        type: 'variable.update',
        key: created!.key,
        patch: { key: 'renamedKey' } as unknown as { label: string }
      })
    ).rejects.toThrow();
  });

  it('blocks removing variables referenced inside reference arrays', async () => {
    const document = await createDocumentWithVariableReferenceArray();
    const before = structuredClone(document);

    await expect(
      apply(document, {
        type: 'variable.remove',
        key: 'tenantId'
      })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.variableStillReferenced
        })
      ]
    });
    expect(document).toEqual(before);
  });

  it('blocks incompatible type changes for variables referenced inside reference arrays', async () => {
    const document = await createDocumentWithVariableReferenceArray();

    await expect(
      apply(document, {
        type: 'variable.update',
        key: 'tenantId',
        patch: { valueType: WorkflowIOValueTypeEnum.object }
      })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.variableTypeChangeIncompatible,
          nodeId: 'read',
          inputKey: NodeInputKeyEnum.fileUrlList
        })
      ]
    });
  });

  it('ignores literal arrays shaped like references on non-reference inputs', async () => {
    const document = await createDocumentWithVariableReferenceArray();
    const read = document.nodes.find((node) => node.nodeId === 'read')!;
    const literal = [VARIABLE_NODE_ID, 'tenantId'];
    read.inputs = [
      {
        key: 'literal',
        label: 'Literal',
        renderTypeList: [FlowNodeInputTypeEnum.textarea],
        value: literal
      },
      {
        key: 'bareTemplate',
        label: 'Bare Template',
        renderTypeList: [FlowNodeInputTypeEnum.textarea],
        value: '{{tenantId}}'
      }
    ];

    const removed = await apply(document, {
      type: 'variable.remove',
      key: 'tenantId'
    });
    expect(removed.document.chatConfig.variables).toEqual([]);
    expect(removed.document.nodes.find((node) => node.nodeId === 'read')?.inputs[0].value).toEqual(
      literal
    );
  });

  it('blocks removing variables referenced by collectionFilterMatch and nested datasetParams', async () => {
    const document = await createDocumentWithVariableReferenceArray();
    const read = document.nodes.find((node) => node.nodeId === 'read')!;
    read.inputs = [
      {
        key: NodeInputKeyEnum.collectionFilterMatch,
        label: 'Whole filter',
        renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter],
        valueType: WorkflowIOValueTypeEnum.string,
        value: [VARIABLE_NODE_ID, 'tenantId']
      },
      {
        key: NodeInputKeyEnum.datasetParams,
        label: 'Dataset params',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        valueType: WorkflowIOValueTypeEnum.object,
        value: {
          collectionFilterMatch: {
            logic: DatasetTagFilterLogicEnum.AND,
            conditions: [
              {
                tag: 'tenant',
                op: 'eq',
                valueMode: DatasetTagFilterValueModeEnum.reference,
                value: [VARIABLE_NODE_ID, 'tenantId']
              }
            ]
          }
        }
      }
    ];

    await expect(
      apply(document, { type: 'variable.remove', key: 'tenantId' })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.variableStillReferenced,
          params: expect.objectContaining({
            references: [
              { nodeId: 'read', inputKey: NodeInputKeyEnum.collectionFilterMatch },
              { nodeId: 'read', inputKey: NodeInputKeyEnum.datasetParams }
            ]
          })
        })
      ]
    });

    await expect(
      apply(document, {
        type: 'variable.update',
        key: 'tenantId',
        patch: { valueType: WorkflowIOValueTypeEnum.object }
      })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.variableTypeChangeIncompatible,
          inputKey: NodeInputKeyEnum.collectionFilterMatch
        })
      ]
    });
  });

  it('blocks removing variables referenced by ifElseList, updateList, and userInputForms while ignoring input mode literals', async () => {
    const document = await createDocumentWithVariableReferenceArray();
    const read = document.nodes.find((node) => node.nodeId === 'read')!;
    read.inputs = [
      {
        key: NodeInputKeyEnum.ifElseList,
        label: 'IfElse',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        valueType: WorkflowIOValueTypeEnum.any,
        value: [
          {
            condition: 'AND',
            list: [
              {
                variable: [VARIABLE_NODE_ID, 'tenantId'],
                valueType: 'reference',
                value: [VARIABLE_NODE_ID, 'tenantId']
              }
            ]
          }
        ]
      },
      {
        key: NodeInputKeyEnum.updateList,
        label: 'Update',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        valueType: WorkflowIOValueTypeEnum.any,
        value: [
          {
            variable: ['start', NodeOutputKeyEnum.userChatInput],
            renderType: FlowNodeInputTypeEnum.input,
            value: ['', `prefix-{{$${VARIABLE_NODE_ID}.tenantId$}}`]
          }
        ]
      },
      {
        key: NodeInputKeyEnum.userInputForms,
        label: 'Forms',
        renderTypeList: [FlowNodeInputTypeEnum.custom],
        valueType: WorkflowIOValueTypeEnum.any,
        value: [
          {
            type: FlowNodeInputTypeEnum.select,
            key: 'choice',
            label: 'Choice',
            listInputType: FlowNodeInputTypeEnum.reference,
            listReference: [[VARIABLE_NODE_ID, 'tenantId']]
          }
        ]
      }
    ];

    await expect(
      apply(document, { type: 'variable.remove', key: 'tenantId' })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.variableStillReferenced,
          params: expect.objectContaining({
            references: [
              { nodeId: 'read', inputKey: NodeInputKeyEnum.ifElseList },
              { nodeId: 'read', inputKey: NodeInputKeyEnum.updateList },
              { nodeId: 'read', inputKey: NodeInputKeyEnum.userInputForms }
            ]
          })
        })
      ]
    });

    read.inputs = [
      {
        key: NodeInputKeyEnum.ifElseList,
        label: 'IfElse',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        value: [
          {
            condition: 'AND',
            list: [
              {
                variable: ['start', NodeOutputKeyEnum.userChatInput],
                valueType: 'input',
                value: [VARIABLE_NODE_ID, 'tenantId']
              }
            ]
          }
        ]
      },
      {
        key: NodeInputKeyEnum.userInputForms,
        label: 'Forms',
        renderTypeList: [FlowNodeInputTypeEnum.custom],
        value: [
          {
            type: FlowNodeInputTypeEnum.select,
            key: 'staticChoice',
            label: 'Static',
            listInputType: FlowNodeInputTypeEnum.input,
            listReference: [[VARIABLE_NODE_ID, 'tenantId']]
          }
        ]
      }
    ];

    const removed = await apply(document, { type: 'variable.remove', key: 'tenantId' });
    expect(removed.document.chatConfig.variables).toEqual([]);
  });

  it('blocks removing variables referenced by password, headerSecret, manual systemInputConfig, and toolConfig', async () => {
    const document = await createDocumentWithVariableReferenceArray();
    const read = document.nodes.find((node) => node.nodeId === 'read')!;
    read.inputs = [
      {
        key: 'apiPassword',
        label: 'Password',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        valueType: WorkflowIOValueTypeEnum.string,
        value: { ref: [VARIABLE_NODE_ID, 'tenantId'] }
      },
      {
        key: 'legacyPassword',
        label: 'Legacy Password',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        valueType: WorkflowIOValueTypeEnum.string,
        value: JSON.stringify({ ref: [VARIABLE_NODE_ID, 'tenantId'] })
      },
      {
        key: NodeInputKeyEnum.headerSecret,
        label: 'Header Secret',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        valueType: WorkflowIOValueTypeEnum.object,
        value: { Authorization: { ref: [VARIABLE_NODE_ID, 'tenantId'] } }
      },
      {
        key: NodeInputKeyEnum.systemInputConfig,
        label: 'System Secret',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        valueType: WorkflowIOValueTypeEnum.object,
        value: {
          type: SystemToolSecretInputTypeEnum.manual,
          value: { token: { ref: [VARIABLE_NODE_ID, 'tenantId'] } }
        }
      },
      {
        key: NodeInputKeyEnum.systemInputConfig,
        label: 'Platform Managed Secret',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        valueType: WorkflowIOValueTypeEnum.object,
        value: {
          type: SystemToolSecretInputTypeEnum.system,
          value: { staleToken: { ref: [VARIABLE_NODE_ID, 'tenantId'] } }
        }
      }
    ];
    read.toolConfig = {
      mcpToolSet: {
        url: 'https://example.com/mcp',
        toolList: [],
        headerSecret: { 'X-Tenant': { ref: [VARIABLE_NODE_ID, 'tenantId'] } }
      }
    };

    await expect(
      apply(document, { type: 'variable.remove', key: 'tenantId' })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.variableStillReferenced,
          params: expect.objectContaining({
            references: [
              { nodeId: 'read', inputKey: 'apiPassword' },
              { nodeId: 'read', inputKey: 'legacyPassword' },
              { nodeId: 'read', inputKey: NodeInputKeyEnum.headerSecret },
              { nodeId: 'read', inputKey: NodeInputKeyEnum.systemInputConfig },
              { nodeId: 'read', inputKey: 'toolConfig.mcpToolSet.headerSecret' }
            ]
          })
        })
      ]
    });
  });

  it('blocks removing variables referenced by explicit templates in text and HTTP key-value inputs', async () => {
    const document = await createDocumentWithVariableReferenceArray();
    const read = document.nodes.find((node) => node.nodeId === 'read')!;
    read.inputs = [
      {
        key: NodeInputKeyEnum.aiSystemPrompt,
        label: 'Prompt',
        renderTypeList: [FlowNodeInputTypeEnum.textarea],
        valueType: WorkflowIOValueTypeEnum.string,
        value: `Tenant={{$${VARIABLE_NODE_ID}.tenantId$}}`
      },
      {
        key: NodeInputKeyEnum.httpHeaders,
        label: 'Headers',
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        value: [
          {
            key: `X-{{$${VARIABLE_NODE_ID}.tenantId$}}`,
            value: `Bearer {{$${VARIABLE_NODE_ID}.tenantId$}}`,
            type: 'string'
          }
        ]
      }
    ];

    await expect(
      apply(document, { type: 'variable.remove', key: 'tenantId' })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.variableStillReferenced,
          params: expect.objectContaining({
            references: [
              { nodeId: 'read', inputKey: NodeInputKeyEnum.aiSystemPrompt },
              { nodeId: 'read', inputKey: NodeInputKeyEnum.httpHeaders }
            ]
          })
        })
      ]
    });
  });
});
