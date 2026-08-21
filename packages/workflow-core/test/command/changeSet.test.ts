import staticWorkflowFixture from '../fixtures/basic-static/workflow.json';
import {
  WORKFLOW_CHANGESET_SCHEMA_VERSION,
  WorkflowDocumentSchema,
  applyWorkflowChangeSet,
  applyWorkflowCommand,
  builtinTemplateProvider,
  getWorkflowChecksum,
  normalizeWorkflowDocument,
  planWorkflowChangeSet,
  type WorkflowChangeSet
} from '../../src';
import { describe, expect, it } from 'vitest';

const dependencies = { templateProvider: builtinTemplateProvider };

const createChangeSet = async (
  commands: WorkflowChangeSet['commands'],
  document = WorkflowDocumentSchema.parse(staticWorkflowFixture)
): Promise<WorkflowChangeSet> => ({
  schemaVersion: WORKFLOW_CHANGESET_SCHEMA_VERSION,
  baseChecksum: await getWorkflowChecksum(document),
  commands
});

describe('WorkflowChangeSet', () => {
  it('keeps a one-command ChangeSet equivalent to the command dispatcher', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const command = { type: 'meta.update', name: 'Changed' } as const;
    const changeSetResult = await applyWorkflowChangeSet({
      document,
      changeSet: await createChangeSet([command], document),
      dependencies
    });
    const commandResult = await applyWorkflowCommand({ document, command, dependencies });
    expect(normalizeWorkflowDocument(changeSetResult.document)).toEqual(
      normalizeWorkflowDocument(commandResult.document)
    );
  });

  it('applies multiple commands in memory and returns a versioned plan', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = await createChangeSet(
      [
        { type: 'meta.update', name: 'Batch changed' },
        {
          type: 'input.set',
          nodeId: 'text',
          inputKey: 'system_textareaInput',
          value: 'Changed by ChangeSet'
        }
      ],
      document
    );
    const result = await planWorkflowChangeSet({ document, changeSet, dependencies });
    expect(result.plan).toMatchObject({
      schemaVersion: 'fastgpt-workflow-plan/v1',
      baseChecksum: changeSet.baseChecksum,
      targetChecksum: result.plan.targetChecksum,
      changes: [{ type: 'meta.update' }, { type: 'input.set', nodeId: 'text' }]
    });
    expect(result.document.app.name).toBe('Batch changed');
    expect(document.app.name).not.toBe('Batch changed');
  });

  it('rejects a stale base checksum before executing commands', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = await createChangeSet([{ type: 'meta.update', name: 'Changed' }], document);
    changeSet.baseChecksum = `sha256:${'0'.repeat(64)}`;
    await expect(
      applyWorkflowChangeSet({ document, changeSet, dependencies })
    ).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'WORKFLOW_BASE_CHECKSUM_MISMATCH' })]
    });
    expect(document.app.name).not.toBe('Changed');
  });

  it('does not expose a partially changed document when a later command fails', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = await createChangeSet(
      [
        { type: 'meta.update', name: 'Should roll back' },
        { type: 'node.remove', nodeId: 'missing-node' }
      ],
      document
    );
    await expect(applyWorkflowChangeSet({ document, changeSet, dependencies })).rejects.toThrow();
    expect(document.app.name).not.toBe('Should roll back');
  });
});
