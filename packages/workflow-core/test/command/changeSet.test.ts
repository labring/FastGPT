import staticWorkflowFixture from '../fixtures/basic-static/workflow.json';
import {
  WORKFLOW_CHANGESET_SCHEMA_VERSION,
  WorkflowDocumentSchema,
  applyWorkflowChangeSet,
  applyWorkflowCommand,
  builtinTemplateProvider,
  getWorkflowChecksum,
  normalizeWorkflowDocument,
  parseNodeTemplateRef,
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
    await expect(
      applyWorkflowChangeSet({ document, changeSet, dependencies })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'WORKFLOW_NODE_NOT_FOUND',
          path: ['commands', 1],
          params: expect.objectContaining({
            commandIndex: 1,
            commandType: 'node.remove'
          })
        })
      ]
    });
    expect(document.app.name).not.toBe('Should roll back');
  });

  it('preserves clone before removing its source node', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = await createChangeSet(
      [
        {
          type: 'node.clone',
          sourceNodeId: 'text',
          nodeId: 'text-copy'
        },
        { type: 'node.remove', nodeId: 'text' }
      ],
      document
    );

    const result = await applyWorkflowChangeSet({ document, changeSet, dependencies });
    expect(result.document.nodes.some((node) => node.nodeId === 'text')).toBe(false);
    expect(
      result.document.nodes
        .find((node) => node.nodeId === 'text-copy')
        ?.inputs.find((input) => input.key === 'system_textareaInput')?.value
    ).toBe('Static response');
  });

  it('clones the source state produced by earlier commands', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = await createChangeSet(
      [
        {
          type: 'input.set',
          nodeId: 'text',
          inputKey: 'system_textareaInput',
          value: 'Changed before clone'
        },
        { type: 'node.clone', sourceNodeId: 'text', nodeId: 'text-copy' }
      ],
      document
    );

    const result = await applyWorkflowChangeSet({ document, changeSet, dependencies });
    expect(
      result.document.nodes
        .find((node) => node.nodeId === 'text-copy')
        ?.inputs.find((input) => input.key === 'system_textareaInput')?.value
    ).toBe('Changed before clone');
  });

  it('preserves remove before adding a replacement with the same nodeId', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = await createChangeSet(
      [
        { type: 'node.remove', nodeId: 'text' },
        {
          type: 'node.add',
          nodeId: 'text',
          template: parseNodeTemplateRef('builtin:assigned-answer')
        }
      ],
      document
    );

    const result = await applyWorkflowChangeSet({ document, changeSet, dependencies });
    expect(result.changes.map((change) => change.type)).toEqual(['node.remove', 'node.add']);
    expect(result.document.nodes.filter((node) => node.nodeId === 'text')).toHaveLength(1);
  });

  it('rejects invalid command order without silently reordering it', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = await createChangeSet(
      [
        {
          type: 'input.ref',
          nodeId: 'extra',
          inputKey: 'text',
          ref: { nodeId: 'text', outputKey: 'system_text' }
        },
        {
          type: 'edge.connect',
          edge: {
            source: { kind: 'next', nodeId: 'text' },
            target: { kind: 'target', nodeId: 'extra' }
          }
        },
        {
          type: 'node.add',
          nodeId: 'extra',
          template: parseNodeTemplateRef('builtin:assigned-answer')
        }
      ],
      document
    );

    await expect(
      applyWorkflowChangeSet({ document, changeSet, dependencies })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'WORKFLOW_NODE_NOT_FOUND',
          path: ['commands', 0],
          params: expect.objectContaining({
            commandIndex: 0,
            commandType: 'input.ref'
          })
        })
      ]
    });
    expect(document.nodes.some((node) => node.nodeId === 'extra')).toBe(false);
  });

  it('provides remediation guidance in WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM when an edge is missing', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    // 添加孤立节点（未连线）
    const withNode = await applyWorkflowCommand({
      document,
      command: {
        type: 'node.add',
        nodeId: 'isolated',
        template: parseNodeTemplateRef('builtin:assigned-answer')
      },
      dependencies
    });

    // 尝试直接引用上游输出，此时由于缺乏 execution edge，应报错并提供清晰的修复指引
    await expect(
      applyWorkflowCommand({
        document: withNode.document,
        command: {
          type: 'input.ref',
          nodeId: 'isolated',
          inputKey: 'text',
          ref: { nodeId: 'text', outputKey: 'system_text' }
        },
        dependencies
      })
    ).rejects.toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: 'WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM',
          params: expect.objectContaining({
            nodeId: 'text',
            outputKey: 'system_text',
            targetNodeId: 'isolated',
            remediation: expect.stringContaining("using 'edge.connect'")
          })
        })
      ]
    });
  });

  it('preserves changeSet.commands in plans and produces an identical recomputed plan', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = await createChangeSet(
      [
        {
          type: 'input.set',
          nodeId: 'text',
          inputKey: 'system_textareaInput',
          value: 'Changed before clone'
        },
        {
          type: 'node.clone',
          sourceNodeId: 'text',
          nodeId: 'text-copy'
        },
        { type: 'node.remove', nodeId: 'text' }
      ],
      document
    );
    const { plan } = await planWorkflowChangeSet({
      document,
      changeSet,
      dependencies
    });
    expect(plan.changeSet.commands).toEqual(changeSet.commands);
    const recomputed = await planWorkflowChangeSet({
      document,
      changeSet: plan.changeSet,
      dependencies
    });
    expect(JSON.stringify(recomputed.plan)).toBe(JSON.stringify(plan));
  });
});
