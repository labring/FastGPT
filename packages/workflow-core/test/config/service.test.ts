import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  applyWorkflowCommand,
  builtinTemplateProvider,
  createWorkflowDocument,
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
