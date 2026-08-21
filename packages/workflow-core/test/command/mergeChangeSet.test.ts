import { describe, expect, it } from 'vitest';
import {
  mergeWorkflowChangeSetChunks,
  WorkflowChangeSetMergeError,
  type WorkflowChangeSetChunk
} from '../../src';

const baseChecksum = `sha256:${'a'.repeat(64)}`;
const chunk = (value: Partial<WorkflowChangeSetChunk>): WorkflowChangeSetChunk => ({
  schemaVersion: 'fastgpt-workflow-chunk/v1',
  chunkId: 'chunk',
  dependsOn: [],
  commands: [{ type: 'meta.update', name: 'name' }],
  ...value
});

describe('mergeWorkflowChangeSetChunks', () => {
  it('orders dependencies deterministically and merges disjoint metadata patches', () => {
    const result = mergeWorkflowChangeSetChunks({
      baseChecksum,
      chunks: [
        chunk({
          chunkId: 'intro',
          dependsOn: ['name'],
          commands: [{ type: 'meta.update', intro: 'intro' }]
        }),
        chunk({ chunkId: 'name', commands: [{ type: 'meta.update', name: 'workflow' }] })
      ]
    });
    expect(result.baseChecksum).toBe(baseChecksum);
    expect(result.commands).toEqual([{ type: 'meta.update', name: 'workflow', intro: 'intro' }]);
  });

  it('deduplicates identical commands but rejects conflicting commands', () => {
    const same = chunk({ chunkId: 'same' });
    expect(
      mergeWorkflowChangeSetChunks({ baseChecksum, chunks: [same, { ...same, chunkId: 'copy' }] })
        .commands
    ).toHaveLength(1);

    try {
      mergeWorkflowChangeSetChunks({
        baseChecksum,
        chunks: [
          chunk({ chunkId: 'one', commands: [{ type: 'config.set', path: 'x', value: 1 }] }),
          chunk({ chunkId: 'two', commands: [{ type: 'config.set', path: 'x', value: 2 }] })
        ]
      });
      expect.fail('Expected a command conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowChangeSetMergeError);
      expect(error).toMatchObject({
        code: 'WORKFLOW_CHANGESET_COMMAND_CONFLICT',
        params: {
          target: 'config:x',
          existing: {
            chunkId: 'one',
            commandIndex: 0,
            commandType: 'config.set'
          },
          incoming: {
            chunkId: 'two',
            commandIndex: 0,
            commandType: 'config.set'
          }
        }
      });
    }
  });

  it('rejects different command types that write the same semantic target', () => {
    expect(() =>
      mergeWorkflowChangeSetChunks({
        baseChecksum,
        chunks: [
          chunk({
            chunkId: 'literal',
            commands: [
              {
                type: 'input.set',
                nodeId: 'answer',
                inputKey: 'text',
                value: 'literal'
              }
            ]
          }),
          chunk({
            chunkId: 'reference',
            commands: [
              {
                type: 'input.ref',
                nodeId: 'answer',
                inputKey: 'text',
                ref: { nodeId: 'upstream', outputKey: 'text' }
              }
            ]
          })
        ]
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'WORKFLOW_CHANGESET_COMMAND_CONFLICT',
        params: {
          target: 'input:answer:text',
          existing: {
            chunkId: 'literal',
            commandIndex: 0,
            commandType: 'input.set'
          },
          incoming: {
            chunkId: 'reference',
            commandIndex: 0,
            commandType: 'input.ref'
          }
        }
      })
    );
  });

  it('reports the actual patch contributor when a merged field conflicts', () => {
    expect(() =>
      mergeWorkflowChangeSetChunks({
        baseChecksum,
        chunks: [
          chunk({
            chunkId: 'name',
            commands: [{ type: 'meta.update', name: 'Workflow' }]
          }),
          chunk({
            chunkId: 'intro',
            commands: [{ type: 'meta.update', intro: 'First intro' }]
          }),
          chunk({
            chunkId: 'intro-conflict',
            commands: [{ type: 'meta.update', intro: 'Second intro' }]
          })
        ]
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'WORKFLOW_CHANGESET_COMMAND_CONFLICT',
        params: expect.objectContaining({
          existing: {
            chunkId: 'intro',
            commandIndex: 0,
            commandType: 'meta.update'
          },
          incoming: {
            chunkId: 'intro-conflict',
            commandIndex: 0,
            commandType: 'meta.update'
          }
        })
      })
    );
  });

  it('rejects missing dependencies and cycles', () => {
    expect(() =>
      mergeWorkflowChangeSetChunks({
        baseChecksum,
        chunks: [chunk({ chunkId: 'child', dependsOn: ['missing'] })]
      })
    ).toThrow(/missing chunk/);
    expect(() =>
      mergeWorkflowChangeSetChunks({
        baseChecksum,
        chunks: [
          chunk({ chunkId: 'one', dependsOn: ['two'] }),
          chunk({ chunkId: 'two', dependsOn: ['one'] })
        ]
      })
    ).toThrow(/cycle/);
  });
});
