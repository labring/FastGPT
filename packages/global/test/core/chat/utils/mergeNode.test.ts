import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  appendNodeResponseByParent,
  childrenResponseFields,
  getChildrenResponses,
  getNodeResponseIdentityKey,
  mergeNodeResponseDataByIdAndParent
} from '@fastgpt/global/core/chat/utils/mergeNode';

const createNodeResponse = (
  override: Partial<ChatHistoryItemResType> & { id: string }
): ChatHistoryItemResType => ({
  nodeId: override.id,
  moduleName: override.id,
  moduleType: FlowNodeTypeEnum.agent,
  ...override
});

describe('appendNodeResponseByParent', () => {
  it('moves an earlier child root under its parent when the parent arrives later', () => {
    const withOrphan = appendNodeResponseByParent(
      [],
      createNodeResponse({
        id: 'child-response',
        parentId: 'root-response'
      })
    );

    const result = appendNodeResponseByParent(
      withOrphan,
      createNodeResponse({
        id: 'root-response'
      })
    );

    expect(result.map((item) => item.id)).toEqual(['root-response']);
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['child-response']);
  });

  it('updates duplicate responses by id without appending duplicate rows', () => {
    const result = appendNodeResponseByParent(
      [
        createNodeResponse({
          id: 'root-response',
          runningTime: 1
        })
      ],
      createNodeResponse({
        id: 'root-response',
        runningTime: 2,
        childrenResponses: [createNodeResponse({ id: 'child-response' })]
      })
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'root-response',
      runningTime: 3
    });
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['child-response']);
  });

  it('does not merge same child id under different parent ids', () => {
    const result = [
      createNodeResponse({ id: 'parent-1' }),
      createNodeResponse({ id: 'parent-2' })
    ].reduce<ChatHistoryItemResType[]>(
      (responses, item) => appendNodeResponseByParent(responses, item),
      []
    );

    const withFirstChild = appendNodeResponseByParent(
      result,
      createNodeResponse({
        id: 'shared-child',
        parentId: 'parent-1',
        moduleName: 'Child 1'
      })
    );
    const withSecondChild = appendNodeResponseByParent(
      withFirstChild,
      createNodeResponse({
        id: 'shared-child',
        parentId: 'parent-2',
        moduleName: 'Child 2'
      })
    );

    expect(withSecondChild[0].childrenResponses).toEqual([
      expect.objectContaining({ id: 'shared-child', parentId: 'parent-1', moduleName: 'Child 1' })
    ]);
    expect(withSecondChild[1].childrenResponses).toEqual([
      expect.objectContaining({ id: 'shared-child', parentId: 'parent-2', moduleName: 'Child 2' })
    ]);
  });

  it('keeps a child as temporary root when parent has not arrived yet', () => {
    const result = appendNodeResponseByParent(
      [],
      createNodeResponse({
        id: 'child-response',
        parentId: 'missing-parent'
      })
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: 'child-response',
        parentId: 'missing-parent'
      })
    ]);
  });

  it('inserts a child under a parent nested in legacy detail fields', () => {
    const result = appendNodeResponseByParent(
      [
        createNodeResponse({
          id: 'root',
          toolDetail: [
            createNodeResponse({
              id: 'legacy-parent'
            })
          ]
        })
      ],
      createNodeResponse({
        id: 'legacy-child',
        parentId: 'legacy-parent'
      })
    );

    expect(result[0].toolDetail?.[0].childrenResponses).toEqual([
      expect.objectContaining({
        id: 'legacy-child',
        parentId: 'legacy-parent'
      })
    ]);
  });
});

describe('node response child helpers', () => {
  it('returns children from all supported child response fields in display order', () => {
    const response = createNodeResponse({
      id: 'root',
      childrenResponses: [createNodeResponse({ id: 'child' })],
      pluginDetail: [createNodeResponse({ id: 'plugin' })],
      toolDetail: [createNodeResponse({ id: 'tool' })],
      loopDetail: [createNodeResponse({ id: 'loop' })],
      parallelDetail: [createNodeResponse({ id: 'parallel' })],
      loopRunDetail: [createNodeResponse({ id: 'loop-run' })]
    });

    expect(childrenResponseFields).toEqual([
      'childrenResponses',
      'pluginDetail',
      'toolDetail',
      'loopDetail',
      'parallelDetail',
      'loopRunDetail'
    ]);
    expect(getChildrenResponses(response).map((item) => item.id)).toEqual([
      'child',
      'plugin',
      'tool',
      'loop',
      'parallel',
      'loop-run'
    ]);
  });

  it('builds node response identity from id and parentId', () => {
    expect(getNodeResponseIdentityKey(createNodeResponse({ id: 'node', parentId: 'parent' }))).toBe(
      'node\u0000parent'
    );
    expect(getNodeResponseIdentityKey(createNodeResponse({ id: 'node' }))).toBe('node\u0000');
  });
});

describe('mergeNodeResponseDataByIdAndParent', () => {
  it('should merge items with same id and parentId', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Tool',
        moduleType: FlowNodeTypeEnum.toolCall,
        runningTime: 1,
        totalPoints: 10
      },
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Tool',
        moduleType: FlowNodeTypeEnum.toolCall,
        runningTime: 2,
        totalPoints: 20
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].runningTime).toBe(3);
    expect(result[0].totalPoints).toBe(30);
  });

  it('should not merge items with different ids', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Tool 1',
        moduleType: FlowNodeTypeEnum.toolCall,
        runningTime: 1
      },
      {
        id: '2',
        nodeId: 'node2',
        moduleName: 'Tool 2',
        moduleType: FlowNodeTypeEnum.toolCall,
        runningTime: 2
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(2);
  });

  it('should not merge items with same mergeSignId but different ids', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: 'before-interactive',
        nodeId: 'tool-node',
        moduleName: 'Tool Before',
        moduleType: FlowNodeTypeEnum.toolCall,
        mergeSignId: 'deprecated-merge-sign-id',
        runningTime: 1
      },
      {
        id: 'after-interactive',
        nodeId: 'tool-node',
        moduleName: 'Tool After',
        moduleType: FlowNodeTypeEnum.toolCall,
        mergeSignId: 'deprecated-merge-sign-id',
        runningTime: 2
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual(['before-interactive', 'after-interactive']);
    expect(result.map((item) => item.runningTime)).toEqual([1, 2]);
  });

  it('should handle empty array', () => {
    const result = mergeNodeResponseDataByIdAndParent([]);

    expect(result).toHaveLength(0);
  });

  it('should merge nested details recursively by id and parentId', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Tool',
        moduleType: FlowNodeTypeEnum.toolCall,
        toolDetail: [
          {
            id: 'detail-1',
            nodeId: 'detail-node',
            moduleName: 'Detail',
            moduleType: FlowNodeTypeEnum.chatNode
          }
        ]
      },
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Tool',
        moduleType: FlowNodeTypeEnum.toolCall,
        toolDetail: [
          {
            id: 'detail-2',
            nodeId: 'detail-node-2',
            moduleName: 'Detail 2',
            moduleType: FlowNodeTypeEnum.chatNode
          }
        ]
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].toolDetail).toHaveLength(2);
  });

  it('should merge childrenResponses recursively', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: 'agent-1',
        nodeId: 'agent-node',
        moduleName: 'Agent',
        moduleType: FlowNodeTypeEnum.agent,
        childTotalPoints: 1,
        childrenResponses: [
          {
            id: 'child-1',
            nodeId: 'tool-node',
            moduleName: 'Tool 1',
            moduleType: FlowNodeTypeEnum.tool
          }
        ]
      },
      {
        id: 'agent-1',
        nodeId: 'agent-node',
        moduleName: 'Agent',
        moduleType: FlowNodeTypeEnum.agent,
        childTotalPoints: 2,
        childrenResponses: [
          {
            id: 'child-2',
            nodeId: 'tool-node-2',
            moduleName: 'Tool 2',
            moduleType: FlowNodeTypeEnum.tool
          }
        ]
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].childTotalPoints).toBeUndefined();
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['child-1', 'child-2']);
  });

  it('should merge repeated node increments with many inline children efficiently', () => {
    const responseDataList: ChatHistoryItemResType[] = Array.from({ length: 20 }, (_, index) => ({
      id: 'agent-1',
      nodeId: 'agent-node',
      moduleName: 'Agent',
      moduleType: FlowNodeTypeEnum.agent,
      runningTime: 1,
      childrenResponses: Array.from({ length: 10 }, (__, childIndex) => ({
        id: `child-${index}-${childIndex}`,
        parentId: 'agent-1',
        nodeId: `child-node-${index}-${childIndex}`,
        moduleName: `Child ${index}-${childIndex}`,
        moduleType: FlowNodeTypeEnum.tool
      }))
    }));

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].runningTime).toBe(20);
    expect(result[0].childrenResponses).toHaveLength(200);
    expect(result[0].childrenResponses?.[0]).toEqual(
      expect.objectContaining({
        id: 'child-0-0',
        parentId: 'agent-1'
      })
    );
    expect(result[0].childrenResponses?.at(-1)).toEqual(
      expect.objectContaining({
        id: 'child-19-9',
        parentId: 'agent-1'
      })
    );
  });

  it('should compose many persisted flat rows with nested legacy detail fields efficiently', () => {
    const rootResponses: ChatHistoryItemResType[] = Array.from({ length: 5 }, (_, rootIndex) => {
      const rootId = `parallel-${rootIndex}`;

      return {
        id: rootId,
        nodeId: rootId,
        moduleName: 'Parallel',
        moduleType: FlowNodeTypeEnum.parallelRun,
        parallelRunDetail: Array.from({ length: 20 }, (_, childIndex) => {
          const childId = `${rootId}-loop-run-${childIndex}`;

          return {
            id: childId,
            parentId: rootId,
            nodeId: childId,
            moduleName: 'Loop run',
            moduleType: FlowNodeTypeEnum.loopRun,
            loopRunDetail: [
              {
                id: `${childId}-plugin`,
                parentId: childId,
                nodeId: `${childId}-plugin`,
                moduleName: 'Plugin',
                moduleType: FlowNodeTypeEnum.pluginModule
              }
            ]
          };
        })
      };
    });
    const responseDataList = rootResponses.flatMap((root) => [
      root,
      ...(root.parallelRunDetail || []),
      ...((root.parallelRunDetail || []).flatMap((child) => child.loopRunDetail || []) || [])
    ]);

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(5);
    expect(result[0].parallelRunDetail).toHaveLength(20);
    expect(result[0].parallelRunDetail?.[0].loopRunDetail).toHaveLength(1);
  });

  it('should merge accumulated tool call fields by id and parentId', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: 'tool-call-before-interactive',
        nodeId: 'tool-call-node',
        moduleName: 'ToolCall',
        moduleType: FlowNodeTypeEnum.toolCall,
        runningTime: 1.2,
        totalPoints: 0.3,
        childTotalPoints: 0.2,
        childResponseCount: 1,
        tokens: 10,
        inputTokens: 6,
        outputTokens: 4,
        toolCallInputTokens: 20,
        toolCallOutputTokens: 8,
        embeddingTokens: 7,
        reRankInputTokens: 5,
        extensionTokens: 3,
        llmRequestIds: ['req-1', 'req-2'],
        datasetQueries: ['old-query'],
        quoteList: [
          {
            id: 'quote-old',
            q: 'old query',
            a: 'old answer',
            datasetId: 'dataset-old',
            collectionId: 'collection-old',
            sourceName: 'old source',
            chunkIndex: 0,
            score: []
          }
        ],
        compressTextAgent: {
          inputTokens: 4,
          outputTokens: 2,
          totalPoints: 0.1
        },
        deepSearchResult: {
          model: 'Qwen-plus',
          inputTokens: 11,
          outputTokens: 5
        }
      },
      {
        id: 'tool-call-before-interactive',
        nodeId: 'tool-call-node',
        moduleName: 'ToolCall',
        moduleType: FlowNodeTypeEnum.toolCall,
        runningTime: 2.34,
        totalPoints: 0.4,
        childTotalPoints: 0.6,
        childResponseCount: 2,
        tokens: 15,
        inputTokens: 9,
        outputTokens: 6,
        toolCallInputTokens: 30,
        toolCallOutputTokens: 12,
        embeddingTokens: 8,
        reRankInputTokens: 6,
        extensionTokens: 4,
        llmRequestIds: ['req-2', 'req-3'],
        datasetQueries: ['latest-query'],
        quoteList: [
          {
            id: 'quote-latest',
            q: 'latest query',
            a: 'latest answer',
            datasetId: 'dataset-latest',
            collectionId: 'collection-latest',
            sourceName: 'latest source',
            chunkIndex: 0,
            score: []
          }
        ],
        compressTextAgent: {
          inputTokens: 8,
          outputTokens: 3,
          totalPoints: 0.2
        },
        deepSearchResult: {
          model: 'Qwen-plus',
          inputTokens: 13,
          outputTokens: 7
        }
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        id: 'tool-call-before-interactive',
        runningTime: 3.54,
        totalPoints: 0.7,
        childResponseCount: 3,
        tokens: 25,
        inputTokens: 15,
        outputTokens: 10,
        toolCallInputTokens: 50,
        toolCallOutputTokens: 20,
        embeddingTokens: 15,
        reRankInputTokens: 11,
        extensionTokens: 7,
        llmRequestIds: ['req-1', 'req-2', 'req-3'],
        datasetQueries: ['latest-query'],
        quoteList: [
          {
            id: 'quote-latest',
            q: 'latest query',
            a: 'latest answer',
            datasetId: 'dataset-latest',
            collectionId: 'collection-latest',
            sourceName: 'latest source',
            chunkIndex: 0,
            score: []
          }
        ],
        compressTextAgent: {
          inputTokens: 12,
          outputTokens: 5,
          totalPoints: expect.closeTo(0.3)
        },
        deepSearchResult: {
          model: 'Qwen-plus',
          inputTokens: 24,
          outputTokens: 12
        }
      })
    );
    expect(result[0].childTotalPoints).toBeUndefined();
  });

  it('should merge duplicated children under a non-duplicated parent', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: 'loop-task-1',
        nodeId: 'loop-task-1',
        moduleName: 'Task 1',
        moduleType: FlowNodeTypeEnum.loopRun,
        childrenResponses: [
          {
            id: 'tool-call-before-interactive',
            nodeId: 'tool-call-node',
            moduleName: 'ToolCall',
            moduleType: FlowNodeTypeEnum.toolCall,
            runningTime: 10.02,
            childrenResponses: [
              {
                id: 'reply-before-interactive',
                nodeId: 'reply-node',
                moduleName: 'Reply',
                moduleType: FlowNodeTypeEnum.answerNode
              }
            ]
          },
          {
            id: 'tool-call-before-interactive',
            nodeId: 'tool-call-node',
            moduleName: 'ToolCall',
            moduleType: FlowNodeTypeEnum.toolCall,
            runningTime: 1.66,
            childrenResponses: [
              {
                id: 'user-select',
                nodeId: 'user-select-node',
                moduleName: 'User Select',
                moduleType: FlowNodeTypeEnum.userSelect
              },
              {
                id: 'reply-after-interactive',
                nodeId: 'reply-node-2',
                moduleName: 'Reply 2',
                moduleType: FlowNodeTypeEnum.answerNode
              }
            ]
          }
        ]
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].childrenResponses).toHaveLength(1);
    expect(result[0].childrenResponses?.[0]).toEqual(
      expect.objectContaining({
        id: 'tool-call-before-interactive',
        runningTime: 11.68
      })
    );
    expect(result[0].childrenResponses?.[0].childrenResponses?.map((item) => item.id)).toEqual([
      'reply-before-interactive',
      'user-select',
      'reply-after-interactive'
    ]);
  });

  it('should merge legacy childrenResponses and childResponseCount', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: 'agent-1',
        nodeId: 'agent-node',
        moduleName: 'Agent',
        moduleType: FlowNodeTypeEnum.agent,
        childResponseCount: 1,
        childrenResponses: [
          {
            id: 'legacy-child',
            nodeId: 'legacy-child',
            moduleName: 'Legacy Child',
            moduleType: FlowNodeTypeEnum.chatNode
          }
        ]
      },
      {
        id: 'agent-1',
        nodeId: 'agent-node',
        moduleName: 'Agent',
        moduleType: FlowNodeTypeEnum.agent,
        childResponseCount: 2,
        childrenResponses: [
          {
            id: 'append-child',
            nodeId: 'append-child',
            moduleName: 'Append Child',
            moduleType: FlowNodeTypeEnum.chatNode
          }
        ]
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].childResponseCount).toBe(3);
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual([
      'legacy-child',
      'append-child'
    ]);
  });

  it('should merge deprecated parallelDetail and loopRunDetail recursively', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: 'parallel-1',
        nodeId: 'parallel-node',
        moduleName: 'Parallel',
        moduleType: FlowNodeTypeEnum.parallelRun,
        parallelDetail: [
          {
            id: 'task-1',
            nodeId: 'task-node-1',
            moduleName: 'Task 1',
            moduleType: FlowNodeTypeEnum.chatNode
          }
        ],
        loopRunDetail: [
          {
            id: 'loop-1',
            nodeId: 'loop-node-1',
            moduleName: 'Loop 1',
            moduleType: FlowNodeTypeEnum.loopRun
          }
        ]
      },
      {
        id: 'parallel-1',
        nodeId: 'parallel-node',
        moduleName: 'Parallel',
        moduleType: FlowNodeTypeEnum.parallelRun,
        parallelDetail: [
          {
            id: 'task-2',
            nodeId: 'task-node-2',
            moduleName: 'Task 2',
            moduleType: FlowNodeTypeEnum.chatNode
          }
        ],
        loopRunDetail: [
          {
            id: 'loop-2',
            nodeId: 'loop-node-2',
            moduleName: 'Loop 2',
            moduleType: FlowNodeTypeEnum.loopRun
          }
        ]
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].parallelDetail?.map((item) => item.id)).toEqual(['task-1', 'task-2']);
    expect(result[0].loopRunDetail?.map((item) => item.id)).toEqual(['loop-1', 'loop-2']);
  });

  it('should keep anonymous responses as separate rows without filtering fields', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        nodeId: 'anonymous-1',
        moduleName: 'Anonymous 1',
        moduleType: FlowNodeTypeEnum.chatNode,
        childTotalPoints: 3,
        childrenResponses: [
          {
            nodeId: 'anonymous-child',
            moduleName: 'Anonymous Child',
            moduleType: FlowNodeTypeEnum.chatNode,
            childTotalPoints: 2
          }
        ]
      },
      {
        nodeId: 'anonymous-2',
        moduleName: 'Anonymous 2',
        moduleType: FlowNodeTypeEnum.chatNode,
        childTotalPoints: 4
      }
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result).toHaveLength(2);
    expect(result[0].childTotalPoints).toBeUndefined();
    expect(result[0].childrenResponses?.[0].childTotalPoints).toBeUndefined();
    expect(result[1].childTotalPoints).toBeUndefined();
  });
});
