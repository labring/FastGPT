import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import {
  WorkflowNodeResponseWriter,
  composeChatItemResponseData,
  composeNodeResponseDetail,
  createChatItemResponseRows,
  createWorkflowNodeResponseWriter,
  getChatItemResponseData,
  getChatItemResponseRows,
  getNodeResponseChildResponseCount
} from '@fastgpt/service/core/chat/nodeResponseStorage';

const base = {
  teamId: '654a4107c32f3bf5f998452f',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: '67e0d5535c02d1d5cdede71f',
  chatId: 'chat-id',
  chatItemDataId: 'ai-data-id'
};

const dbBase = {
  teamId: base.teamId,
  sourceType: base.sourceType,
  appId: base.sourceId,
  chatId: base.chatId,
  chatItemDataId: base.chatItemDataId
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
      ...dbBase,
      data: {
        id: 'root',
        nodeId: 'root',
        moduleType: FlowNodeTypeEnum.agent,
        childResponseCount: 3
      }
    });
    expect(rows[0].data.childResponseCount).toBe(3);
    expect(rows[0].data.childrenResponses?.map((item) => item.id)).toEqual(['child']);
    expect(rows[0].data.toolDetail?.map((item) => item.id)).toEqual(['tool-child']);
    expect(rows[0].data.childrenResponses?.[0].quoteList?.[0]).toMatchObject({
      id: 'quote-1',
      q: 'question',
      a: 'answer'
    });
  });

  it('does not generate childTotalPoints in response rows', () => {
    const rows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        makeResponse({
          id: 'loop',
          moduleType: FlowNodeTypeEnum.loopRun,
          totalPoints: 1,
          childrenResponses: [makeResponse({ id: 'loop-child', totalPoints: 2 })]
        }),
        makeResponse({
          id: 'batch',
          moduleType: FlowNodeTypeEnum.parallelRun,
          totalPoints: 3,
          childrenResponses: [makeResponse({ id: 'batch-child', totalPoints: 4 })]
        })
      ]
    });

    expect(rows[0].data.childTotalPoints).toBeUndefined();
    expect(rows[0].data.childResponseCount).toBe(1);
    expect(rows[1].data.childTotalPoints).toBeUndefined();
    expect(rows[1].data.childResponseCount).toBe(1);
  });

  it('generates ids for invalid input without response id', () => {
    const rows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        {
          nodeId: 'legacy-node',
          moduleName: 'Legacy Node',
          moduleType: FlowNodeTypeEnum.chatNode
        } as ChatHistoryItemResType
      ]
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].data.id).toBeTruthy();
    expect(rows[0].data.nodeId).toBe('legacy-node');
  });

  it('keeps root dataset quote list complete when creating rows', () => {
    const rows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        makeResponse({
          id: 'dataset-root',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          quoteList: [
            {
              id: 'quote-1',
              q: 'full question should not be stored',
              a: 'full answer should not be stored',
              indexes: [
                { type: 'qa', dataId: 'data-1', text: 'full question should not be stored' }
              ],
              datasetId: 'dataset-1',
              collectionId: 'collection-1',
              sourceId: 'source-1',
              sourceName: 'source',
              chunkIndex: 0,
              score: []
            }
          ]
        })
      ]
    });

    expect(rows[0].data.quoteList?.[0]).toMatchObject({
      id: 'quote-1',
      q: 'full question should not be stored',
      a: 'full answer should not be stored',
      indexes: [{ type: 'qa', dataId: 'data-1', text: 'full question should not be stored' }]
    });
  });
});

describe('getNodeResponseChildResponseCount', () => {
  it('keeps legacy child responses without id in child response count', () => {
    const count = getNodeResponseChildResponseCount([
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

    expect(count).toBe(3);
  });

  it('normalizes flat parentId children before counting to avoid double counting descendants', () => {
    const count = getNodeResponseChildResponseCount([
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

    expect(count).toBe(3);
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

  it('folds append rows by id and parentId after rebuilding childrenResponses', () => {
    const rows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        makeResponse({
          id: 'interactive-response',
          runningTime: 1,
          childrenResponses: [makeResponse({ id: 'append-child-1' })]
        }),
        makeResponse({
          id: 'interactive-response',
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

  it('does not fold rows with the same id under different parentId', () => {
    const rows = createChatItemResponseRows({
      ...base,
      nodeResponses: [
        makeResponse({ id: 'parent-1' }),
        makeResponse({ id: 'parent-2' }),
        makeResponse({
          id: 'shared-child',
          parentId: 'parent-1',
          moduleName: 'Child under parent 1',
          totalPoints: 1
        }),
        makeResponse({
          id: 'shared-child',
          parentId: 'parent-2',
          moduleName: 'Child under parent 2',
          totalPoints: 2
        })
      ]
    });

    const result = composeNodeResponseDetail(rows);

    expect(result).toHaveLength(2);
    expect(result[0].childrenResponses).toEqual([
      expect.objectContaining({
        id: 'shared-child',
        parentId: 'parent-1',
        totalPoints: 1
      })
    ]);
    expect(result[1].childrenResponses).toEqual([
      expect.objectContaining({
        id: 'shared-child',
        parentId: 'parent-2',
        totalPoints: 2
      })
    ]);
  });

  it('skips rows without data or data id', () => {
    expect(
      composeChatItemResponseData({
        rows: [
          {},
          {
            data: {
              nodeId: 'missing-id',
              moduleName: 'Missing Id',
              moduleType: FlowNodeTypeEnum.chatNode
            }
          },
          {
            data: makeResponse({
              id: 'root'
            })
          }
        ]
      })
    ).toEqual([
      expect.objectContaining({
        id: 'root'
      })
    ]);
  });
});

describe('getChatItemResponseData', () => {
  beforeEach(async () => {
    await MongoChatItemResponse.deleteMany(dbBase);
  });

  it('reads persisted rows before fallback responseData', async () => {
    await MongoChatItemResponse.create([
      {
        ...dbBase,
        data: makeResponse({
          id: 'child',
          parentId: 'root',
          moduleName: 'Child'
        })
      },
      {
        ...dbBase,
        data: makeResponse({
          id: 'root',
          moduleName: 'Root'
        })
      }
    ]);

    const rows = await getChatItemResponseRows(base);
    expect(rows.map((row) => row.data?.id)).toEqual(['child', 'root']);

    await expect(
      getChatItemResponseData({
        ...base,
        fallbackResponseData: [makeResponse({ id: 'fallback' })]
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'root',
        childrenResponses: [
          expect.objectContaining({
            id: 'child',
            parentId: 'root'
          })
        ]
      })
    ]);
  });

  it('uses fallback responseData as-is when there are no rows', async () => {
    const result = await getChatItemResponseData({
      ...base,
      fallbackResponseData: [
        makeResponse({
          id: 'fallback-root',
          childTotalPoints: 10,
          childrenResponses: [
            makeResponse({
              id: 'fallback-child',
              childTotalPoints: 3
            })
          ]
        })
      ]
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'fallback-root',
        childTotalPoints: 10,
        childrenResponses: [
          expect.objectContaining({
            id: 'fallback-child',
            childTotalPoints: 3
          })
        ]
      })
    ]);
  });
});

describe('WorkflowNodeResponseWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flushes rows in batches and releases pending rows after success', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 3,
      model: {
        create
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
      childResponseCount: 1,
      childrenResponses: [expect.objectContaining({ id: 'child' })]
    });
    expect(streamedRoot[0].childTotalPoints).toBeUndefined();

    await writer.record([makeResponse({ id: 'second' })]);
    expect(create).not.toHaveBeenCalled();
    await writer.record([makeResponse({ id: 'third' })]);
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
    const session = { id: 'session-id' } as any;
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      session,
      model: {
        create
      }
    });

    await writer.record([makeResponse({ id: 'root' })]);

    expect(create.mock.calls[0][1]).toMatchObject({
      session
    });
  });

  it('writes append-only rows without a generated mongo session when no session is provided', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      model: {
        create
      }
    });

    await writer.record([makeResponse({ id: 'root' })]);

    expect(create.mock.calls[0][1]?.session).toBeUndefined();
    expect(create.mock.calls[0][1]).toMatchObject({
      ordered: true
    });
  });

  it('writes one buffered batch and lets mongo validate payload size', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const session = { id: 'session-id' } as any;
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      session,
      model: {
        create
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
        create
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
        create: vi.fn().mockResolvedValue(undefined)
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

  it('retains full dataset quoteList in memory while persisting slim rows', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      retainInMemory: true,
      model: {
        create
      }
    });

    const [returnedResponse] = await writer.record([
      makeResponse({
        id: 'dataset-root',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        quoteList: [
          {
            id: 'quote-1',
            q: 'full question',
            a: 'full answer',
            indexes: [{ type: 'qa', dataId: 'data-1', text: 'full question' }],
            datasetId: 'dataset-1',
            collectionId: 'collection-1',
            sourceId: 'source-1',
            sourceName: 'source',
            chunkIndex: 0,
            score: []
          } as any
        ]
      })
    ]);

    expect(returnedResponse.quoteList?.[0]).toMatchObject({
      id: 'quote-1',
      q: 'full question',
      a: 'full answer',
      indexes: [{ type: 'qa', dataId: 'data-1', text: 'full question' }]
    });
    expect(writer.getFlatNodeResponses()[0].quoteList?.[0]).toMatchObject({
      id: 'quote-1',
      q: 'full question',
      a: 'full answer',
      indexes: [{ type: 'qa', dataId: 'data-1', text: 'full question' }]
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0][0].data.quoteList?.[0]).toEqual({
      id: 'quote-1',
      chunkIndex: 0,
      datasetId: 'dataset-1',
      collectionId: 'collection-1',
      sourceId: 'source-1',
      sourceName: 'source',
      score: []
    });
  });

  it('slims dataset retrievalResults alongside quoteList before persisting', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      retainInMemory: true,
      model: { create }
    });

    const [returnedResponse] = await writer.record([
      makeResponse({
        id: 'dataset-root',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        quoteList: [
          {
            id: 'quote-1',
            q: 'reranked question',
            a: 'reranked answer',
            datasetId: 'dataset-1',
            collectionId: 'collection-1',
            sourceId: 'source-1',
            sourceName: 'source',
            chunkIndex: 0,
            score: []
          } as any
        ],
        retrievalResults: [
          {
            id: 'recall-1',
            q: 'full question',
            a: 'full answer',
            indexes: [{ type: 'qa', dataId: 'data-1', text: 'full question' }],
            datasetId: 'dataset-1',
            collectionId: 'collection-1',
            sourceId: 'source-1',
            sourceName: 'source',
            chunkIndex: 1,
            score: []
          } as any
        ]
      })
    ]);

    // 内存中保留完整 q/a，供当前请求的日志详情使用
    expect(returnedResponse.retrievalResults?.[0]).toMatchObject({
      id: 'recall-1',
      q: 'full question',
      a: 'full answer',
      indexes: [{ type: 'qa', dataId: 'data-1', text: 'full question' }]
    });
    // 入库前瘦身，避免重排开启时单行体积翻倍
    const persisted = create.mock.calls[0][0][0].data.retrievalResults?.[0];
    expect(persisted).toEqual({
      id: 'recall-1',
      chunkIndex: 1,
      datasetId: 'dataset-1',
      collectionId: 'collection-1',
      sourceId: 'source-1',
      sourceName: 'source',
      score: []
    });
    expect(persisted).not.toHaveProperty('q');
    expect(persisted).not.toHaveProperty('a');
    expect(persisted).not.toHaveProperty('indexes');
  });

  it('slims dataset retrievalResults even when quoteList is absent', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      retainInMemory: true,
      model: { create }
    });

    await writer.record([
      makeResponse({
        id: 'dataset-root',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        retrievalResults: [
          { id: 'recall-1', q: 'full question', a: 'full answer', chunkIndex: 0 } as any
        ]
      })
    ]);

    expect(create.mock.calls[0][0][0].data.retrievalResults?.[0]).not.toHaveProperty('q');
  });

  it('retains all flat nodeResponse increments and folds them for composition', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      retainInMemory: true,
      model: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    });

    await writer.record([makeResponse({ id: 'child', moduleName: 'Child' })]);
    await writer.record([makeResponse({ id: 'child', moduleName: 'Latest Child' })]);

    expect(writer.getFlatNodeResponses()).toEqual([
      expect.objectContaining({
        id: 'child',
        moduleName: 'Child'
      }),
      expect.objectContaining({
        id: 'child',
        moduleName: 'Latest Child'
      })
    ]);
    expect(
      composeNodeResponseDetail(
        writer.getFlatNodeResponses().map((response) => ({ data: response }))
      )
    ).toEqual([
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

  it('keeps all buffered increments when id is recorded repeatedly before flush', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: {
        create
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
    expect(create.mock.calls[0][0]).toHaveLength(2);
    expect(create.mock.calls[0][0][0]).toMatchObject({
      data: {
        id: 'node',
        moduleName: 'First',
        totalPoints: 1
      }
    });
    expect(create.mock.calls[0][0][1]).toMatchObject({
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
        create
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
        create
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
      childResponseCount: 1
    });
    expect(writer.isFullyFlushed).toBe(true);
  });

  it('keeps slim fallback rows free of generated childTotalPoints', async () => {
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
        create
      }
    });

    await writer.record([
      makeResponse({
        id: 'loop',
        moduleType: FlowNodeTypeEnum.loopRun,
        totalPoints: 6,
        childResponseCount: 1,
        childrenResponses: [makeResponse({ id: 'child', totalPoints: 2 })]
      })
    ]);

    expect(create).toHaveBeenCalledTimes(4);
    expect(create.mock.calls[3][0][0].data).toEqual({
      nodeId: 'loop',
      id: 'loop',
      moduleType: FlowNodeTypeEnum.loopRun,
      moduleName: 'loop',
      totalPoints: 6,
      childResponseCount: 1
    });
    expect(writer.isFullyFlushed).toBe(true);
  });

  it('drops rows and continues when normal and slim fallback writes fail', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db rejects every payload'));
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      model: {
        create
      }
    });

    await writer.record([makeResponse({ id: 'root' })]);

    expect(create).toHaveBeenCalledTimes(4);
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
        create
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
      totalPoints: 8,
      inputTokens: 0,
      outputTokens: 0
    });
  });

  it('collects write summary for save metadata while rows are released', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    });

    await writer.record([
      makeResponse({
        id: 'root-error',
        totalPoints: 10,
        inputTokens: 234,
        outputTokens: 56,
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
      totalPoints: 10,
      // token 与 points 口径相反：points 只有容器节点自身聚合过子节点、只能取根节点，
      // 而 token 从不聚合进父节点，必须遍历全部响应实例才不会漏掉嵌套 LLM 调用。
      inputTokens: 234,
      outputTokens: 56
    });
  });

  it('counts tokens from child rows while keeping points root-only', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: { create: vi.fn().mockResolvedValue(undefined) }
    });

    await writer.record([
      // 容器节点：totalPoints 已由模块自身聚合，token 字段不存在
      makeResponse({ id: 'loop-parent', totalPoints: 10, childResponseCount: 2 }),
      makeResponse({
        id: 'loop-child-a',
        parentId: 'loop-parent',
        inputTokens: 100,
        outputTokens: 20
      }),
      makeResponse({
        id: 'loop-child-b',
        parentId: 'loop-parent',
        inputTokens: 5,
        outputTokens: 7
      })
    ]);

    expect(writer.getSummary()).toEqual({
      citeCollectionIds: [],
      errorCount: 0,
      totalPoints: 10,
      lastError: undefined,
      inputTokens: 105,
      outputTokens: 27
    });
  });

  it('counts toolCall tokens that only live under toolCall* fields', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: { create: vi.fn().mockResolvedValue(undefined) }
    });

    await writer.record([
      makeResponse({ id: 'toolcall', toolCallInputTokens: 321, toolCallOutputTokens: 45 })
    ]);

    const summary = writer.getSummary();
    expect(summary.inputTokens).toBe(321);
    expect(summary.outputTokens).toBe(45);
  });

  it('counts inline children that never become their own row', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: { create: vi.fn().mockResolvedValue(undefined) }
    });

    // datasetSearch 会把 query extension / image caption 内联在 childrenResponses 里，
    // writer 不展开它们，只扫行顶层字段会漏。
    await writer.record([
      makeResponse({
        id: 'search',
        embeddingTokens: 11,
        reRankInputTokens: 13,
        childrenResponses: [makeResponse({ id: 'ext', inputTokens: 100, outputTokens: 25 })]
      })
    ]);

    const summary = writer.getSummary();
    expect(summary.inputTokens).toBe(124);
    expect(summary.outputTokens).toBe(25);
  });

  it('counts deepSearchResult tokens but not the compressTextAgent duplicate', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: { create: vi.fn().mockResolvedValue(undefined) }
    });

    await writer.record([
      makeResponse({
        id: 'search',
        inputTokens: 10,
        outputTokens: 4,
        deepSearchResult: { model: 'deep', inputTokens: 50, outputTokens: 8 },
        // compressTextAgent 是同一行自身 flat 字段的副本，累加会翻倍
        compressTextAgent: { inputTokens: 10, outputTokens: 4, totalPoints: 1 }
      })
    ]);

    const summary = writer.getSummary();
    expect(summary.inputTokens).toBe(60);
    expect(summary.outputTokens).toBe(12);
  });

  it('counts a response once when it is both inlined and written as its own row', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: { create: vi.fn().mockResolvedValue(undefined) }
    });

    // retainInMemory 路径下 toolDetail 内联的响应同时会被 sink 写成独立 row。
    // 顺序反转也要成立，所以两种到达顺序都断言。
    await writer.record([
      makeResponse({
        id: 'toolcall',
        toolDetail: [makeResponse({ id: 'tool-detail', inputTokens: 70, outputTokens: 9 })]
      })
    ]);
    await writer.record([
      makeResponse({ id: 'tool-detail', parentId: 'toolcall', inputTokens: 70, outputTokens: 9 })
    ]);

    expect(writer.getSummary().inputTokens).toBe(70);
    expect(writer.getSummary().outputTokens).toBe(9);
  });

  it('counts an inlined response once when the standalone row arrives first', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: { create: vi.fn().mockResolvedValue(undefined) }
    });

    await writer.record([
      makeResponse({ id: 'tool-detail', parentId: 'toolcall', inputTokens: 70, outputTokens: 9 })
    ]);
    await writer.record([
      makeResponse({
        id: 'toolcall',
        toolDetail: [makeResponse({ id: 'tool-detail', inputTokens: 70, outputTokens: 9 })]
      })
    ]);

    expect(writer.getSummary().inputTokens).toBe(70);
    expect(writer.getSummary().outputTokens).toBe(9);
  });

  it('overwrites the same response instance instead of adding it twice', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: { create: vi.fn().mockResolvedValue(undefined) }
    });

    // interactive 恢复会复用同一个 nodeResponseId，后到的完成态要覆盖开始态。
    await writer.record([makeResponse({ id: 'chat', inputTokens: 10, outputTokens: 1 })]);
    await writer.record([makeResponse({ id: 'chat', inputTokens: 40, outputTokens: 6 })]);

    const summary = writer.getSummary();
    expect(summary.inputTokens).toBe(40);
    expect(summary.outputTokens).toBe(6);
  });

  it('creates a writer through factory and writes rows with default options', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const writer = await createWorkflowNodeResponseWriter({
      ...base,
      batchSize: 1,
      model: {
        create
      }
    });

    await writer.record([makeResponse({ id: 'factory-root' })]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0][0]).toMatchObject({
      ...dbBase,
      data: expect.objectContaining({
        id: 'factory-root'
      })
    });
  });

  it('keeps separate summary contributions for same id under different parentId', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    });

    await writer.record([
      makeResponse({ id: 'parent-1' }),
      makeResponse({ id: 'parent-2' }),
      makeResponse({
        id: 'shared-child',
        parentId: 'parent-1',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        quoteList: [
          {
            id: 'quote-1',
            collectionId: 'collection-parent-1',
            datasetId: 'dataset',
            sourceId: 'source',
            sourceName: 'source',
            chunkIndex: 0,
            score: []
          }
        ]
      }),
      makeResponse({
        id: 'shared-child',
        parentId: 'parent-2',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        quoteList: [
          {
            id: 'quote-2',
            collectionId: 'collection-parent-2',
            datasetId: 'dataset',
            sourceId: 'source',
            sourceName: 'source',
            chunkIndex: 0,
            score: []
          }
        ]
      })
    ]);

    expect(writer.getSummary().citeCollectionIds).toEqual([
      'collection-parent-1',
      'collection-parent-2'
    ]);
  });

  it('ignores tool execution errors in summary while tracking root errors', async () => {
    const writer = new WorkflowNodeResponseWriter({
      ...base,
      batchSize: 10,
      model: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    });

    await writer.record([
      makeResponse({
        id: 'flat-tool-sandbox',
        moduleType: FlowNodeTypeEnum.tool,
        errorText: 'Sandbox timeout',
        totalPoints: 2
      }),
      makeResponse({
        id: 'flat-tool-custom',
        toolRes: 'Command failed',
        errorText: 'Command failed',
        totalPoints: 1
      }),
      makeResponse({
        id: 'root-llm',
        moduleType: FlowNodeTypeEnum.chatNode,
        totalPoints: 5
      })
    ]);

    expect(writer.getSummary()).toEqual({
      citeCollectionIds: [],
      errorCount: 0,
      lastError: undefined,
      totalPoints: 8
    });
  });
});
