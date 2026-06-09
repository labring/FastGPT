import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import {
  WorkflowNodeResponseWriter,
  composeNodeResponseDetail,
  createChatItemResponseRows,
  getNodeResponseChildStats
} from '@fastgpt/service/core/chat/nodeResponseStorage';

const base = {
  teamId: '654a4107c32f3bf5f998452f',
  appId: '67e0d5535c02d1d5cdede71f',
  chatId: 'chat-id',
  chatItemDataId: 'ai-data-id'
};

const makeResponse = (
  overrides: Partial<ChatHistoryItemResType> & Pick<ChatHistoryItemResType, 'id'>
): ChatHistoryItemResType => ({
  nodeId: overrides.id,
  moduleName: overrides.id,
  moduleType: FlowNodeTypeEnum.agent,
  ...overrides
});

describe('createChatItemResponseRows', () => {
  it('creates one row per input response and keeps childrenResponses inline', () => {
    const rows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        makeResponse({
          id: 'root',
          totalPoints: 10,
          toolDetail: [
            makeResponse({
              id: 'tool-child',
              moduleType: FlowNodeTypeEnum.tool,
              totalPoints: 2
            })
          ],
          childrenResponses: [
            makeResponse({
              id: 'child',
              moduleType: FlowNodeTypeEnum.datasetSearchNode,
              totalPoints: 3,
              quoteList: [
                {
                  id: 'quote-1',
                  q: 'question',
                  a: 'answer',
                  datasetId: 'dataset-1',
                  collectionId: 'collection-1',
                  sourceId: 'source-1',
                  sourceName: 'source',
                  chunkIndex: 0,
                  score: []
                }
              ],
              childrenResponses: [
                makeResponse({
                  id: 'grandchild',
                  moduleType: FlowNodeTypeEnum.chatNode,
                  totalPoints: 1
                })
              ]
            })
          ]
        })
      ]
    });

    expect(rows.map((row) => row.data.id)).toEqual(['root']);
    expect(rows.map((row) => row.data.parentId)).toEqual([undefined]);
    expect(rows[0]).toMatchObject({
      ...base,
      data: {
        id: 'root',
        nodeId: 'root',
        moduleType: FlowNodeTypeEnum.agent,
        childTotalPoints: 6,
        childResponseCount: 3
      }
    });
    expect(rows[0].data.childTotalPoints).toBe(6);
    expect(rows[0].data.childResponseCount).toBe(3);
    expect(rows[0].data.childrenResponses?.map((item) => item.id)).toEqual(['child']);
    expect(rows[0].data.toolDetail?.map((item) => item.id)).toEqual(['tool-child']);
    expect(rows[0].data.childrenResponses?.[0].quoteList?.[0]).toMatchObject({
      id: 'quote-1',
      q: 'question',
      a: 'answer'
    });
  });
});

describe('getNodeResponseChildStats', () => {
  it('keeps legacy child responses without id in child stats', () => {
    const stats = getNodeResponseChildStats([
      {
        nodeId: 'legacy-child-a',
        moduleName: 'legacy-child-a',
        moduleType: FlowNodeTypeEnum.chatNode,
        totalPoints: 1
      },
      {
        nodeId: 'legacy-child-b',
        moduleName: 'legacy-child-b',
        moduleType: FlowNodeTypeEnum.chatNode,
        totalPoints: 2,
        childTotalPoints: 3,
        childResponseCount: 1
      }
    ] as ChatHistoryItemResType[]);

    expect(stats).toEqual({
      childTotalPoints: 6,
      childResponseCount: 3
    });
  });

  it('normalizes flat parentId children before counting to avoid double counting descendants', () => {
    const stats = getNodeResponseChildStats([
      makeResponse({
        id: 'task-wrapper',
        totalPoints: 3,
        childTotalPoints: 4,
        childResponseCount: 2
      }),
      makeResponse({
        id: 'task-child-a',
        parentId: 'task-wrapper',
        totalPoints: 1
      }),
      makeResponse({
        id: 'task-child-b',
        parentId: 'task-wrapper',
        totalPoints: 3
      })
    ]);

    expect(stats).toEqual({
      childTotalPoints: 7,
      childResponseCount: 3
    });
  });
});

describe('composeNodeResponseDetail', () => {
  it('composes rows into childrenResponses using insertion order', () => {
    const rows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        makeResponse({
          id: 'root',
          childrenResponses: [
            makeResponse({ id: 'child-1', totalPoints: 1 }),
            makeResponse({ id: 'child-2', totalPoints: 2 })
          ]
        })
      ]
    });

    const result = composeNodeResponseDetail(rows);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('root');
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['child-1', 'child-2']);
  });

  it('attaches child rows when they are written before the parent row', () => {
    const childRows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        makeResponse({
          id: 'child',
          parentId: 'root'
        })
      ]
    });
    const parentRows = createChatItemResponseRows({
      ...base,
      nodeResponses: [makeResponse({ id: 'root' })]
    });

    const result = composeNodeResponseDetail([...childRows, ...parentRows]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('root');
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['child']);
  });

  it('merges append rows by mergeSignId after rebuilding childrenResponses', () => {
    const rows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        makeResponse({
          id: 'append-1',
          mergeSignId: 'interactive',
          runningTime: 1,
          childrenResponses: [makeResponse({ id: 'append-child-1' })]
        }),
        makeResponse({
          id: 'append-2',
          mergeSignId: 'interactive',
          runningTime: 2,
          childrenResponses: [makeResponse({ id: 'append-child-2' })]
        })
      ]
    });

    const result = composeNodeResponseDetail(rows);

    expect(result).toHaveLength(1);
    expect(result[0].runningTime).toBe(3);
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual([
      'append-child-1',
      'append-child-2'
    ]);
  });
});

describe('WorkflowNodeResponseWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flushes rows in batches and releases pending rows after success', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 3,
      model: {
        create,
        deleteMany
      }
    });

    const streamedRoot = await writer.record([
      makeResponse({
        id: 'root',
        childrenResponses: [makeResponse({ id: 'child', totalPoints: 1 })]
      })
    ]);
    expect(create).not.toHaveBeenCalled();
    expect(streamedRoot).toHaveLength(1);
    expect(streamedRoot[0]).toMatchObject({
      id: 'root',
      childTotalPoints: 1,
      childResponseCount: 1,
      childrenResponses: [expect.objectContaining({ id: 'child' })]
    });

    await writer.record([makeResponse({ id: 'second' })]);
    expect(create).not.toHaveBeenCalled();
    await writer.record([makeResponse({ id: 'third' })]);
    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        'data.id': { $in: ['root', 'second', 'third'] }
      }),
      expect.any(Object)
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].map((doc: any) => doc.data.id)).toEqual([
      'root',
      'second',
      'third'
    ]);
    expect(create.mock.calls[0][1]).toMatchObject({
      ordered: true
    });
    expect(writer.isFullyFlushed).toBe(true);
  });

  it('passes mongo session to create writes', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    const session = { id: 'session-id' } as any;
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      session,
      model: {
        create,
        deleteMany
      }
    });

    await writer.record([makeResponse({ id: 'root' })]);

    expect(deleteMany.mock.calls[0][1]).toMatchObject({
      session
    });
    expect(create.mock.calls[0][1]).toMatchObject({
      session
    });
  });

  it('uses one generated mongo session for delete and create when no session is provided', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      model: {
        create,
        deleteMany
      }
    });

    await writer.record([makeResponse({ id: 'root' })]);

    expect(deleteMany.mock.calls[0][1]?.session).toBeDefined();
    expect(create.mock.calls[0][1]?.session).toBe(deleteMany.mock.calls[0][1]?.session);
    expect(create.mock.calls[0][1]).toMatchObject({
      ordered: true
    });
  });

  it('writes one buffered batch and lets mongo validate payload size', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    const session = { id: 'session-id' } as any;
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      session,
      model: {
        create,
        deleteMany
      }
    });

    await writer.record([
      makeResponse({ id: 'first', customOutputs: { text: 'a'.repeat(700) } }),
      makeResponse({ id: 'second', customOutputs: { text: 'b'.repeat(700) } }),
      makeResponse({ id: 'third', customOutputs: { text: 'c'.repeat(700) } })
    ]);
    await writer.close();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].map((doc: any) => doc.data.id)).toEqual([
      'first',
      'second',
      'third'
    ]);
    expect(create.mock.calls[0][1]).toMatchObject({
      ordered: true,
      session
    });
  });

  it('serializes shared writer records from parent and child workflows in call order', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 2,
      model: {
        create,
        deleteMany: vi.fn()
      }
    });

    await writer.record([makeResponse({ id: 'parent' })]);
    await writer.recordWithParent([makeResponse({ id: 'child' })], 'parent');

    expect(create).toHaveBeenCalledTimes(1);
    expect(
      create.mock.calls[0][0].map((doc: any) => ({
        id: doc.data.id,
        parentId: doc.data.parentId
      }))
    ).toEqual([
      { id: 'parent', parentId: undefined },
      { id: 'child', parentId: 'parent' }
    ]);
  });

  it('retains flat nodeResponses in memory for business-layer composition', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      retainInMemory: true,
      model: {
        create: vi.fn().mockResolvedValue(undefined),
        deleteMany: vi.fn().mockResolvedValue(undefined)
      }
    });

    await writer.record([
      makeResponse({
        id: 'child',
        parentId: 'root',
        moduleName: 'Child'
      }),
      makeResponse({
        id: 'root',
        moduleName: 'Root',
        childResponseCount: 1
      })
    ]);

    expect(writer.getFlatNodeResponses()).toEqual([
      expect.objectContaining({
        id: 'child',
        parentId: 'root',
        moduleName: 'Child'
      }),
      expect.objectContaining({
        id: 'root',
        moduleName: 'Root'
      })
    ]);
    expect(
      composeNodeResponseDetail(
        writer.getFlatNodeResponses().map((response) => ({ data: response }))
      )
    ).toEqual([
      expect.objectContaining({
        id: 'root',
        childrenResponses: [expect.objectContaining({ id: 'child' })]
      })
    ]);
  });

  it('retains only latest flat nodeResponse by id using db semantics', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      retainInMemory: true,
      model: {
        create: vi.fn().mockResolvedValue(undefined),
        deleteMany: vi.fn().mockResolvedValue(undefined)
      }
    });

    await writer.record([makeResponse({ id: 'child', moduleName: 'Child' })]);
    await writer.record([makeResponse({ id: 'child', moduleName: 'Latest Child' })]);

    expect(writer.getFlatNodeResponses()).toEqual([
      expect.objectContaining({
        id: 'child',
        moduleName: 'Latest Child'
      })
    ]);
  });

  it('supports a no-db writer without retaining buffered rows', async () => {
    const create = vi.spyOn(MongoChatItemResponse, 'create');
    const deleteMany = vi.spyOn(MongoChatItemResponse, 'deleteMany');
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      persistToDb: false,
      retainInMemory: true
    });

    await writer.record([makeResponse({ id: 'debug-root' })]);

    expect(writer.getFlatNodeResponses()).toEqual([
      expect.objectContaining({
        id: 'debug-root'
      })
    ]);
    expect(writer.isFullyFlushed).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('keeps only the latest buffered row when id is recorded repeatedly before flush', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: {
        create,
        deleteMany: vi.fn()
      }
    });

    await writer.record([
      makeResponse({
        id: 'node',
        moduleName: 'First',
        totalPoints: 1
      })
    ]);
    await writer.record([
      makeResponse({
        id: 'node',
        moduleName: 'Latest',
        totalPoints: 3
      })
    ]);
    await writer.close();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toHaveLength(1);
    expect(create.mock.calls[0][0][0]).toMatchObject({
      data: {
        id: 'node',
        moduleName: 'Latest',
        totalPoints: 3
      }
    });
    expect(writer.getSummary()).toMatchObject({
      totalPoints: 3
    });
  });

  it('retries failed writes and releases rows after a retry succeeds', async () => {
    const create = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      model: {
        create,
        deleteMany: vi.fn()
      }
    });

    await writer.record([makeResponse({ id: 'root' })]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0].map((doc: any) => doc.data.id)).toEqual(['root']);
    expect(writer.isFullyFlushed).toBe(true);
  });

  it('writes slim fallback rows after normal retries keep failing', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('invalid payload 1'))
      .mockRejectedValueOnce(new Error('invalid payload 2'))
      .mockRejectedValueOnce(new Error('invalid payload 3'))
      .mockResolvedValueOnce(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      model: {
        create,
        deleteMany: vi.fn()
      }
    });

    await writer.record([
      makeResponse({
        id: 'root',
        moduleLogo: 'avatar.svg',
        runningTime: 1.2,
        totalPoints: 6,
        inputTokens: 10,
        outputTokens: 20,
        customOutputs: { huge: 'payload' },
        quoteList: [
          {
            id: 'quote',
            collectionId: 'collection',
            datasetId: 'dataset',
            sourceId: 'source',
            sourceName: 'source',
            chunkIndex: 0,
            score: []
          }
        ],
        childrenResponses: [
          makeResponse({
            id: 'child',
            totalPoints: 2,
            runningTime: 0.5,
            tokens: 11,
            customOutputs: { huge: 'child payload' }
          })
        ]
      })
    ]);

    expect(create).toHaveBeenCalledTimes(4);
    expect(create.mock.calls[3][0].map((doc: any) => doc.data.id)).toEqual(['root']);
    expect(create.mock.calls[3][0][0]).toMatchObject({
      data: {
        childTotalPoints: 2,
        childResponseCount: 1
      }
    });
    expect(create.mock.calls[3][0][0].data).toEqual({
      nodeId: 'root',
      id: 'root',
      moduleType: FlowNodeTypeEnum.agent,
      moduleName: 'root',
      moduleLogo: 'avatar.svg',
      runningTime: 1.2,
      inputTokens: 10,
      outputTokens: 20,
      totalPoints: 6,
      childTotalPoints: 2,
      childResponseCount: 1
    });
    expect(writer.isFullyFlushed).toBe(true);
  });

  it('drops rows and continues when normal and slim fallback writes fail', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db rejects every payload'));
    const deleteMany = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      replaceBeforeFirstFlush: true,
      model: {
        create,
        deleteMany
      }
    });

    await writer.record([makeResponse({ id: 'root' })]);

    expect(create).toHaveBeenCalledTimes(4);
    expect(deleteMany).toHaveBeenCalledTimes(5);
    expect(deleteMany.mock.calls.at(-1)?.[0]).toEqual({
      appId: base.appId,
      chatId: base.chatId,
      chatItemDataId: base.chatItemDataId
    });
    expect(writer.isFullyFlushed).toBe(true);
    expect(writer.getSummary()).toMatchObject({
      errorCount: 0,
      totalPoints: 0
    });
  });

  it('keeps summary contributions when detail rows are dropped after fallback failure', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db rejects every payload'));
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      model: {
        create,
        deleteMany: vi.fn().mockResolvedValue(undefined)
      }
    });

    await writer.record([
      makeResponse({
        id: 'root',
        totalPoints: 8,
        errorText: 'root failed',
        childrenResponses: [
          makeResponse({
            id: 'dataset-child',
            moduleType: FlowNodeTypeEnum.datasetSearchNode,
            quoteList: [
              {
                id: 'quote',
                collectionId: 'collection-from-dropped-row',
                datasetId: 'dataset',
                sourceId: 'source',
                sourceName: 'source',
                chunkIndex: 0,
                score: []
              }
            ]
          })
        ]
      })
    ]);

    expect(writer.isFullyFlushed).toBe(true);
    expect(writer.getSummary()).toEqual({
      citeCollectionIds: ['collection-from-dropped-row'],
      errorCount: 1,
      lastError: 'root failed',
      totalPoints: 8
    });
  });

  it('collects write summary for save metadata while rows are released', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: {
        create: vi.fn().mockResolvedValue(undefined),
        deleteMany: vi.fn()
      }
    });

    await writer.record([
      makeResponse({
        id: 'root-error',
        totalPoints: 10,
        errorText: 'failed',
        childrenResponses: [
          makeResponse({
            id: 'dataset-child',
            moduleType: FlowNodeTypeEnum.datasetSearchNode,
            totalPoints: 3,
            quoteList: [
              {
                id: 'quote',
                collectionId: 'collection-1',
                datasetId: 'dataset-1',
                sourceId: 'source-1',
                sourceName: 'source',
                chunkIndex: 0,
                score: []
              }
            ]
          })
        ]
      })
    ]);

    expect(writer.getSummary()).toEqual({
      citeCollectionIds: ['collection-1'],
      errorCount: 1,
      lastError: 'failed',
      totalPoints: 10
    });
  });
});
