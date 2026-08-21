import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  applyWorkflowCommand,
  builtinTemplateProvider,
  createWorkflowDocument,
  getChatConfigDescriptor,
  listChatConfigDescriptors,
  parseNodeTemplateRef
} from '../../src';
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
          maxFiles: expect.objectContaining({ type: 'integer' }),
          canSelectFile: expect.objectContaining({ type: 'boolean' })
        }
      }
    });
  });

  it('returns one descriptor for every allowlisted configuration path', () => {
    const descriptors = listChatConfigDescriptors({ document: createWorkflowDocument() });

    expect(descriptors).toHaveLength(14);
    expect(descriptors.every(({ description }) => description.length > 0)).toBe(true);
    expect(descriptors.find(({ path }) => path === 'autoExecute.open')?.valueSchema).toMatchObject({
      type: 'boolean'
    });
  });
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
          code: 'WORKFLOW_FILE_OUTPUT_STILL_REFERENCED',
          nodeId: 'start'
        })
      ]
    });
    expect(document).toEqual(before);
  });
});

describe('global variable references', () => {
  it('renames variables inside reference arrays without changing other references', async () => {
    const document = await createDocumentWithVariableReferenceArray();
    const result = await apply(document, {
      type: 'variable.update',
      key: 'tenantId',
      patch: { key: 'currentTenantId' }
    });

    expect(
      result.document.nodes
        .find((node) => node.nodeId === 'read')
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)?.value
    ).toEqual([
      [VARIABLE_NODE_ID, 'currentTenantId'],
      ['start', NodeOutputKeyEnum.userFiles]
    ]);
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
          code: 'WORKFLOW_VARIABLE_STILL_REFERENCED'
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
          code: 'WORKFLOW_VARIABLE_TYPE_CHANGE_INCOMPATIBLE',
          nodeId: 'read',
          inputKey: NodeInputKeyEnum.fileUrlList
        })
      ]
    });
  });
});
