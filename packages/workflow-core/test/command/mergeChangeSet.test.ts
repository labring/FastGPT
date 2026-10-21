import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { describe, expect, it } from 'vitest';
import staticWorkflowFixture from '../fixtures/basic-static/workflow.json';
import { WorkflowDocumentSchema } from '@fastgpt/global/core/workflow/type/document';
import { applyWorkflowChangeSet } from '../../src/command/applyChangeSet';
import { builtinTemplateProvider } from '../template/provider';
import { getWorkflowChecksum } from '../../src/domain/checksum';
import {
  mergeWorkflowChangeSetChunks,
  WorkflowChangeSetMergeError
} from '../../src/command/mergeChangeSet';
import { type WorkflowChangeSetChunk, type WorkflowCommand } from '../../src/command/type';

const baseChecksum = `sha256:${'a'.repeat(64)}`;
const chunk = (value: Partial<WorkflowChangeSetChunk>): WorkflowChangeSetChunk => ({
  schemaVersion: 'fastgpt-workflow-chunk/v1',
  chunkId: 'chunk',
  dependsOn: [],
  commands: [{ type: 'meta.update', name: 'name' }],
  ...value
});

describe('mergeWorkflowChangeSetChunks', () => {
  it('preserves dependency order when the merged ChangeSet is executed', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const changeSet = mergeWorkflowChangeSetChunks({
      baseChecksum: await getWorkflowChecksum(document),
      chunks: [
        chunk({
          chunkId: 'clone',
          dependsOn: ['update'],
          commands: [{ type: 'node.clone', sourceNodeId: 'text', nodeId: 'text-copy' }]
        }),
        chunk({
          chunkId: 'update',
          commands: [
            {
              type: 'input.set',
              nodeId: 'text',
              inputKey: 'system_textareaInput',
              value: 'Changed in dependency'
            }
          ]
        })
      ]
    });

    expect(changeSet.commands.map((command) => command.type)).toEqual(['input.set', 'node.clone']);
    const result = await applyWorkflowChangeSet({
      document,
      changeSet,
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    expect(
      result.document.nodes
        .find((node) => node.nodeId === 'text-copy')
        ?.inputs.find((input) => input.key === 'system_textareaInput')?.value
    ).toBe('Changed in dependency');
  });

  it.each(['single chunk', 'dependent chunks'])(
    'keeps patches on either side of a clone in their execution order for %s',
    async (mode) => {
      const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
      const source = document.nodes.find((node) => node.nodeId === 'text')!;
      source.position = { x: 10, y: 20 };
      const commands: WorkflowCommand[] = [
        { type: 'node.update', nodeId: 'text', name: 'Renamed before cloning' },
        { type: 'node.clone', sourceNodeId: 'text', nodeId: 'text-copy' },
        { type: 'node.update', nodeId: 'text', position: { x: 300, y: 400 } }
      ];
      const chunks =
        mode === 'single chunk'
          ? [chunk({ chunkId: 'sequence', commands })]
          : [
              chunk({ chunkId: 'move', dependsOn: ['clone'], commands: [commands[2]] }),
              chunk({ chunkId: 'clone', dependsOn: ['rename'], commands: [commands[1]] }),
              chunk({ chunkId: 'rename', commands: [commands[0]] })
            ];
      const changeSet = mergeWorkflowChangeSetChunks({
        baseChecksum: await getWorkflowChecksum(document),
        chunks
      });

      expect(changeSet.commands).toEqual(commands);
      const result = await applyWorkflowChangeSet({
        document,
        changeSet,
        dependencies: { templateProvider: builtinTemplateProvider }
      });
      expect(result.document.nodes.find((node) => node.nodeId === 'text-copy')).toMatchObject({
        name: 'Renamed before cloning',
        position: { x: 50, y: 60 }
      });
      expect(result.document.nodes.find((node) => node.nodeId === 'text')).toMatchObject({
        position: { x: 300, y: 400 }
      });
    }
  );

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

  it('deduplicates adjacent commands but rejects conflicting commands', () => {
    const same = chunk({ chunkId: 'same' });
    expect(
      mergeWorkflowChangeSetChunks({ baseChecksum, chunks: [same, { ...same, chunkId: 'copy' }] })
        .commands
    ).toHaveLength(1);
    expect(
      mergeWorkflowChangeSetChunks({
        baseChecksum,
        chunks: [
          same,
          chunk({ chunkId: 'intro', commands: [{ type: 'meta.update', intro: 'intro' }] }),
          { ...same, chunkId: 'copy' },
          chunk({
            chunkId: 'combined',
            commands: [{ type: 'meta.update', name: 'name', intro: 'intro' }]
          })
        ]
      }).commands
    ).toEqual([{ type: 'meta.update', name: 'name', intro: 'intro' }]);

    const combinedPatch: WorkflowCommand = { type: 'meta.update', name: 'name', intro: 'intro' };
    const divider: WorkflowCommand = {
      type: 'config.set',
      path: 'welcomeConfig.welcomeText',
      value: 'Welcome'
    };
    expect(
      mergeWorkflowChangeSetChunks({
        baseChecksum,
        chunks: [
          chunk({
            commands: [
              ...same.commands,
              { type: 'meta.update', intro: 'intro' },
              divider,
              combinedPatch
            ]
          })
        ]
      }).commands
    ).toEqual([combinedPatch, divider, combinedPatch]);

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
        code: WorkflowDiagnosticCodeEnum.changesetCommandConflict,
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
        code: WorkflowDiagnosticCodeEnum.changesetCommandConflict,
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

  it('retains repeated commands separated by operations that change their effect', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const commands: WorkflowCommand[] = [
      { type: 'edge.disconnect', edge: document.executionEdges[1] },
      {
        type: 'edge.reconnect',
        oldEdge: document.executionEdges[0],
        newEdge: document.executionEdges[1]
      },
      { type: 'edge.disconnect', edge: document.executionEdges[1] }
    ];
    const changeSet = mergeWorkflowChangeSetChunks({
      baseChecksum: await getWorkflowChecksum(document),
      chunks: [
        chunk({ chunkId: 'disconnect-last', dependsOn: ['reconnect'], commands: [commands[2]] }),
        chunk({ chunkId: 'reconnect', dependsOn: ['disconnect-first'], commands: [commands[1]] }),
        chunk({ chunkId: 'disconnect-first', commands: [commands[0]] })
      ]
    });

    expect(changeSet.commands).toEqual(commands);
    const result = await applyWorkflowChangeSet({
      document,
      changeSet,
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    expect(result.document.executionEdges).toEqual([]);
  });

  it('keeps a repeated node patch around a clone in its original position', async () => {
    const document = WorkflowDocumentSchema.parse(staticWorkflowFixture);
    const source = document.nodes.find((node) => node.nodeId === 'text')!;
    source.position = { x: 10, y: 20 };
    const commands: WorkflowCommand[] = [
      { type: 'node.update', nodeId: 'text', position: { x: 300, y: 400 } },
      { type: 'node.clone', sourceNodeId: 'text', nodeId: 'text-copy' },
      { type: 'node.update', nodeId: 'text', position: { x: 300, y: 400 } }
    ];
    const changeSet = mergeWorkflowChangeSetChunks({
      baseChecksum: await getWorkflowChecksum(document),
      chunks: [chunk({ commands })]
    });

    expect(changeSet.commands).toEqual(commands);
    const result = await applyWorkflowChangeSet({
      document,
      changeSet,
      dependencies: { templateProvider: builtinTemplateProvider }
    });
    expect(result.document.nodes.find((node) => node.nodeId === 'text-copy')?.position).toEqual({
      x: 340,
      y: 440
    });
  });

  it.each([
    { field: 'name', value: 'Second name', conflictingChunkId: 'name' },
    { field: 'intro', value: 'Second intro', conflictingChunkId: 'intro' }
  ])(
    'reports the actual contributor when a separated $field patch conflicts',
    ({ field, value, conflictingChunkId }) => {
      expect(() =>
        mergeWorkflowChangeSetChunks({
          baseChecksum,
          chunks: [
            chunk({
              chunkId: 'name',
              commands: [{ type: 'meta.update', name: 'Workflow' }]
            }),
            chunk({
              chunkId: 'config',
              commands: [
                { type: 'config.set', path: 'welcomeConfig.welcomeText', value: 'Welcome' }
              ]
            }),
            chunk({
              chunkId: 'intro',
              commands: [{ type: 'meta.update', intro: 'First intro' }]
            }),
            chunk({
              chunkId: 'conflict',
              commands: [{ type: 'meta.update', [field]: value }]
            })
          ]
        })
      ).toThrowError(
        expect.objectContaining({
          code: WorkflowDiagnosticCodeEnum.changesetCommandConflict,
          params: expect.objectContaining({
            existing: {
              chunkId: conflictingChunkId,
              commandIndex: 0,
              commandType: 'meta.update'
            },
            incoming: {
              chunkId: 'conflict',
              commandIndex: 0,
              commandType: 'meta.update'
            }
          })
        })
      );
    }
  );

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
