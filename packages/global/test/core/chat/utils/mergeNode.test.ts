import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  appendNodeResponseByParent,
  childrenResponseFields,
  collectNodeResponseTokens,
  getChildrenResponses,
  getNodeResponseIdentityKey,
  mergeNodeResponseDataByIdAndParent,
  sumNodeResponseTokens
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

  it('should keep resumed children added after their parent was attached to a grandparent', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      createNodeResponse({
        id: 'before-interactive',
        parentId: 'iteration-1',
        moduleName: 'Before interactive'
      }),
      createNodeResponse({
        id: 'iteration-1',
        parentId: 'loop-run',
        moduleType: FlowNodeTypeEnum.loopRun,
        childResponseCount: 1
      }),
      createNodeResponse({
        id: 'loop-run',
        moduleType: FlowNodeTypeEnum.loopRun,
        childResponseCount: 2
      }),
      createNodeResponse({
        id: 'after-interactive',
        parentId: 'iteration-1',
        moduleName: 'After interactive'
      }),
      createNodeResponse({
        id: 'iteration-1',
        parentId: 'loop-run',
        moduleType: FlowNodeTypeEnum.loopRun,
        childResponseCount: 1
      })
    ];

    const result = mergeNodeResponseDataByIdAndParent(responseDataList);

    expect(result.map((item) => item.id)).toEqual(['loop-run']);
    expect(result[0].childrenResponses?.map((item) => item.id)).toEqual(['iteration-1']);
    expect(result[0].childrenResponses?.[0]).toEqual(
      expect.objectContaining({
        childResponseCount: 2
      })
    );
    expect(result[0].childrenResponses?.[0].childrenResponses?.map((item) => item.id)).toEqual([
      'before-interactive',
      'after-interactive'
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

describe('collectNodeResponseTokens', () => {
  const collect = (responses: ChatHistoryItemResType[]) => {
    const owners = new Map<string, string>();
    const total = { inputTokens: 0, outputTokens: 0 };

    responses.forEach((response, index) => {
      collectNodeResponseTokens(response, `owner-${index}`, owners, total);
    });

    return total;
  };

  it('sums the canonical token fields of one response', () => {
    expect(
      collect([
        createNodeResponse({
          id: 'chat',
          inputTokens: 100,
          outputTokens: 20,
          toolCallInputTokens: 5,
          toolCallOutputTokens: 6,
          embeddingTokens: 7,
          reRankInputTokens: 8
        })
      ])
    ).toEqual({ inputTokens: 120, outputTokens: 26 });
  });

  it('includes deepSearchResult because it has no child row of its own', () => {
    expect(
      collect([
        createNodeResponse({
          id: 'search',
          deepSearchResult: { model: 'deep', inputTokens: 30, outputTokens: 4 }
        })
      ])
    ).toEqual({ inputTokens: 30, outputTokens: 4 });
  });

  it('excludes legacy fields that duplicate input+output', () => {
    expect(
      collect([
        createNodeResponse({
          id: 'legacy',
          tokens: 999,
          extensionTokens: 888,
          inputTokens: 10,
          outputTokens: 2,
          // compressTextAgent 是同一行自身 flat 字段的副本
          compressTextAgent: { inputTokens: 10, outputTokens: 2, totalPoints: 1 }
        })
      ])
    ).toEqual({ inputTokens: 10, outputTokens: 2 });
  });

  it('walks inline child responses', () => {
    expect(
      collect([
        createNodeResponse({
          id: 'parent',
          inputTokens: 1,
          childrenResponses: [
            createNodeResponse({
              id: 'child',
              inputTokens: 2,
              toolDetail: [createNodeResponse({ id: 'grandchild', inputTokens: 3 })]
            })
          ]
        })
      ])
    ).toEqual({ inputTokens: 6, outputTokens: 0 });
  });

  it('counts a response once when it is inlined and also passed as its own row', () => {
    const inlined = createNodeResponse({ id: 'shared', inputTokens: 40 });

    expect(
      collect([
        createNodeResponse({ id: 'parent', childrenResponses: [inlined] }),
        createNodeResponse({ id: 'shared', parentId: 'parent', inputTokens: 40 })
      ])
    ).toEqual({ inputTokens: 40, outputTokens: 0 });
  });

  it('accumulates into the caller total, leaving overwrite semantics to the caller', () => {
    const owners = new Map<string, string>();
    const total = { inputTokens: 0, outputTokens: 0 };

    collectNodeResponseTokens(
      createNodeResponse({ id: 'chat', inputTokens: 10 }),
      'chat-owner',
      owners,
      total
    );
    collectNodeResponseTokens(
      createNodeResponse({ id: 'chat', inputTokens: 45 }),
      'chat-owner',
      owners,
      total
    );

    // 本函数只负责累加进传入的 total。同一 ownerKey 的"后到覆盖先到"由调用方保证：
    // collectSummary 每行新建一个 total 再赋值给该 identity 的贡献，因此 10 不会残留。
    expect(total.inputTokens).toBe(55);

    const perRow = { inputTokens: 0, outputTokens: 0 };
    collectNodeResponseTokens(
      createNodeResponse({ id: 'chat', inputTokens: 45 }),
      'chat-owner',
      owners,
      perRow
    );
    // 重新遍历同一响应（已登记的 id 属于同一 owner）仍然会计入，调用方据此覆盖旧值。
    expect(perRow.inputTokens).toBe(45);
  });

  it('counts an id-less response on every traversal since it cannot be claimed', () => {
    // 已知限制：无 id 的响应无法登记归属。生产行由 createChatItemResponseRows 兜底分配 id，
    // 只有旧数据/异常输入里的内联 child 会缺 id，这里把行为固化下来避免被误改。
    expect(
      collect([
        createNodeResponse({
          id: 'first',
          childrenResponses: [createNodeResponse({ id: '', inputTokens: 5 })]
        }),
        createNodeResponse({
          id: 'second',
          childrenResponses: [createNodeResponse({ id: '', inputTokens: 5 })]
        })
      ])
    ).toEqual({ inputTokens: 10, outputTokens: 0 });
  });
});

describe('sumNodeResponseTokens', () => {
  it('sums a list of roots, including their inline subtrees', () => {
    expect(
      sumNodeResponseTokens([
        createNodeResponse({
          id: 'chat',
          inputTokens: 10,
          outputTokens: 2,
          childrenResponses: [createNodeResponse({ id: 'compress', inputTokens: 5 })]
        }),
        createNodeResponse({ id: 'search', embeddingTokens: 7, reRankInputTokens: 3 })
      ])
    ).toEqual({ inputTokens: 25, outputTokens: 2 });
  });

  it('counts an inlined response once even when it is also a row of the same list', () => {
    expect(
      sumNodeResponseTokens([
        createNodeResponse({
          id: 'parent',
          childrenResponses: [createNodeResponse({ id: 'shared', inputTokens: 40 })]
        }),
        createNodeResponse({ id: 'shared', parentId: 'parent', inputTokens: 40 })
      ])
    ).toEqual({ inputTokens: 40, outputTokens: 0 });
  });

  it('returns zeroed totals for an empty list', () => {
    expect(sumNodeResponseTokens([])).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
