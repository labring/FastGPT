import { describe, expect, it } from 'vitest';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatFileTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { ChatItemMiniType, ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { SANDBOX_SHELL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import {
  concatHistories,
  getHistoryPreview,
  filterNodeResponseTreeData,
  filterPublicNodeResponseData,
  removeEmptyUserInput,
  getPluginOutputsFromChatResponses,
  getChatSourceByPublishChannel,
  getFlatAppResponses,
  checkInteractiveResponseStatus,
  removeAIResponseCite,
  hasContextCheckpoint
} from '@fastgpt/global/core/chat/utils';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

describe('concatHistories', () => {
  it('should concat two history arrays', () => {
    const histories1: ChatItemMiniType[] = [
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Hello' } }] }
    ];
    const histories2: ChatItemMiniType[] = [
      { obj: ChatRoleEnum.AI, value: [{ text: { content: 'Hi there' } }] }
    ];

    const result = concatHistories(histories1, histories2);

    expect(result).toHaveLength(2);
  });

  it('should sort system messages first', () => {
    const histories1: ChatItemMiniType[] = [
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Hello' } }] }
    ];
    const histories2: ChatItemMiniType[] = [
      { obj: ChatRoleEnum.System, value: [{ text: { content: 'System prompt' } }] }
    ];

    const result = concatHistories(histories1, histories2);

    expect(result[0].obj).toBe(ChatRoleEnum.System);
  });
});

describe('hasContextCheckpoint', () => {
  it('should return true only when an AI history contains contextCheckpoint', () => {
    const history: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        { text: { content: 'regular assistant text' } },
        { contextCheckpoint: '<context_checkpoint>summary</context_checkpoint>' }
      ]
    };

    expect(hasContextCheckpoint(history)).toBe(true);
  });

  it('should return false for non-AI histories even when contextCheckpoint field exists', () => {
    const history = {
      obj: ChatRoleEnum.Human,
      value: [{ contextCheckpoint: '<context_checkpoint>summary</context_checkpoint>' }]
    } as any as ChatItemMiniType;

    expect(hasContextCheckpoint(history)).toBe(false);
  });

  it('should return false when AI history has no contextCheckpoint', () => {
    const history: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'regular assistant text' } }]
    };

    expect(hasContextCheckpoint(history)).toBe(false);
  });
});

describe('getHistoryPreview', () => {
  it('should return preview of messages', () => {
    const messages: ChatItemMiniType[] = [
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Hello' } }] },
      { obj: ChatRoleEnum.AI, value: [{ text: { content: 'Hi there' } }] }
    ];

    const result = getHistoryPreview(messages);

    expect(result).toHaveLength(2);
    expect(result[0].obj).toBe(ChatRoleEnum.Human);
    expect(result[0].value).toContain('Hello');
  });

  it('should handle system messages', () => {
    const messages: ChatItemMiniType[] = [
      { obj: ChatRoleEnum.System, value: [{ text: { content: 'System prompt' } }] }
    ];

    const result = getHistoryPreview(messages);

    expect(result[0].obj).toBe(ChatRoleEnum.System);
    expect(result[0].value).toContain('System prompt');
  });

  it('should handle empty messages', () => {
    const result = getHistoryPreview([]);

    expect(result).toHaveLength(0);
  });
});

describe('filterPublicNodeResponseData', () => {
  it('should filter to only public node types', () => {
    const nodeResponses: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Chat',
        moduleType: FlowNodeTypeEnum.chatNode,
        runningTime: 1
      },
      {
        id: '2',
        nodeId: 'node2',
        moduleName: 'Dataset Search',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        runningTime: 0.5
      }
    ];

    const result = filterPublicNodeResponseData({ nodeRespones: nodeResponses });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      moduleType: FlowNodeTypeEnum.datasetSearchNode,
      runningTime: 0.5
    });
  });

  it('should return empty array for undefined input', () => {
    const result = filterPublicNodeResponseData({});

    expect(result).toHaveLength(0);
  });

  it('should include quoteList when responseDetail is true', () => {
    const nodeResponses: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Dataset Search',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        runningTime: 0.5,
        quoteList: [
          {
            id: 'q1',
            q: 'test',
            a: 'answer',
            datasetId: 'ds1',
            collectionId: 'col1',
            sourceName: 'source1',
            chunkIndex: 0,
            score: []
          }
        ]
      }
    ];

    const result = filterPublicNodeResponseData({
      nodeRespones: nodeResponses,
      responseDetail: true
    });

    expect(result[0].quoteList).toBeDefined();
  });

  it('should keep tool node type and toolId without exposing tool details', () => {
    const nodeResponses: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Sandbox',
        moduleType: FlowNodeTypeEnum.tool,
        runningTime: 0.8,
        toolId: SANDBOX_SHELL_TOOL_NAME,
        toolInput: {
          command: 'ls'
        },
        toolRes: 'file.txt'
      }
    ];

    const result = filterPublicNodeResponseData({ nodeRespones: nodeResponses });

    expect(result).toEqual([
      {
        moduleType: FlowNodeTypeEnum.tool,
        runningTime: 0.8,
        toolId: SANDBOX_SHELL_TOOL_NAME
      }
    ]);
  });

  it('should recursively filter childrenResponses', () => {
    const nodeResponses: ChatHistoryItemResType[] = [
      {
        id: 'agent',
        nodeId: 'agent-node',
        moduleName: 'Agent',
        moduleType: FlowNodeTypeEnum.agent,
        childTotalPoints: 2,
        childResponseCount: 1,
        childrenResponses: [
          {
            id: 'dataset',
            parentId: 'agent',
            nodeId: 'dataset-node',
            moduleName: 'Dataset Search',
            moduleType: FlowNodeTypeEnum.datasetSearchNode,
            quoteList: [
              {
                id: 'quote-1',
                q: 'private question',
                a: 'private answer',
                datasetId: 'dataset-1',
                collectionId: 'collection-1',
                sourceName: 'source',
                chunkIndex: 0,
                score: []
              }
            ]
          },
          {
            id: 'hidden',
            nodeId: 'hidden-node',
            moduleName: 'Hidden',
            moduleType: FlowNodeTypeEnum.chatNode,
            textOutput: 'hidden'
          }
        ]
      }
    ];

    const result = filterPublicNodeResponseData({
      nodeRespones: nodeResponses,
      responseDetail: true
    });

    expect(result).toHaveLength(1);
    expect(result[0].childrenResponses).toEqual([
      {
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        quoteList: [
          {
            id: 'quote-1',
            q: 'private question',
            a: 'private answer',
            datasetId: 'dataset-1',
            collectionId: 'collection-1',
            sourceName: 'source',
            chunkIndex: 0,
            score: []
          }
        ]
      }
    ]);
    expect(result[0]).toEqual({
      moduleType: FlowNodeTypeEnum.agent,
      childrenResponses: result[0].childrenResponses
    });
  });
});

describe('filterNodeResponseTreeData', () => {
  it('keeps tree identity fields needed by SSE responseData merge', () => {
    const nodeResponses: ChatHistoryItemResType[] = [
      {
        id: 'agent',
        nodeId: 'agent-node',
        moduleName: 'Agent',
        moduleType: FlowNodeTypeEnum.agent,
        totalPoints: 2,
        childResponseCount: 1,
        childrenResponses: [
          {
            id: 'dataset',
            parentId: 'agent',
            nodeId: 'dataset-node',
            moduleName: 'Dataset Search',
            moduleType: FlowNodeTypeEnum.datasetSearchNode,
            quoteList: [
              {
                id: 'quote-1',
                q: 'private question',
                a: 'private answer',
                datasetId: 'dataset-1',
                collectionId: 'collection-1',
                sourceName: 'source',
                chunkIndex: 0,
                score: []
              }
            ]
          }
        ]
      }
    ];

    const result = filterNodeResponseTreeData({
      nodeResponses,
      responseDetail: true
    });

    expect(result).toEqual([
      {
        id: 'agent',
        nodeId: 'agent-node',
        moduleName: 'Agent',
        moduleType: FlowNodeTypeEnum.agent,
        totalPoints: 2,
        childResponseCount: 1,
        childrenResponses: [
          {
            id: 'dataset',
            parentId: 'agent',
            nodeId: 'dataset-node',
            moduleName: 'Dataset Search',
            moduleType: FlowNodeTypeEnum.datasetSearchNode,
            quoteList: [
              {
                id: 'quote-1',
                q: 'private question',
                a: 'private answer',
                datasetId: 'dataset-1',
                collectionId: 'collection-1',
                sourceName: 'source',
                chunkIndex: 0,
                score: []
              }
            ]
          }
        ]
      }
    ]);
  });
});

describe('removeEmptyUserInput', () => {
  it('should keep items with text content', () => {
    const input = [{ text: { content: 'Hello' } }, { text: { content: '' } }];

    const result = removeEmptyUserInput(input);

    expect(result).toHaveLength(1);
    expect(result[0].text?.content).toBe('Hello');
  });

  it('should keep items with file key or url', () => {
    const input = [
      { file: { type: ChatFileTypeEnum.image, url: 'http://example.com/img.png' } },
      { file: { type: ChatFileTypeEnum.image, url: '' } }
    ];

    const result = removeEmptyUserInput(input);

    expect(result).toHaveLength(1);
  });

  it('should return empty array for undefined input', () => {
    const result = removeEmptyUserInput(undefined);

    expect(result).toHaveLength(0);
  });

  it('should filter whitespace-only text', () => {
    const input = [{ text: { content: '   ' } }];

    const result = removeEmptyUserInput(input);

    expect(result).toHaveLength(0);
  });
});

describe('getPluginOutputsFromChatResponses', () => {
  it('should extract plugin outputs', () => {
    const responses: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Plugin Output',
        moduleType: FlowNodeTypeEnum.pluginOutput,
        pluginOutput: { result: 'success' }
      }
    ];

    const result = getPluginOutputsFromChatResponses(responses);

    expect(result).toEqual({ result: 'success' });
  });

  it('should return empty object when no plugin output', () => {
    const responses: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Chat',
        moduleType: FlowNodeTypeEnum.chatNode
      }
    ];

    const result = getPluginOutputsFromChatResponses(responses);

    expect(result).toEqual({});
  });
});

describe('getChatSourceByPublishChannel', () => {
  it('should map share channel to share source', () => {
    expect(getChatSourceByPublishChannel(PublishChannelEnum.share)).toBe(ChatSourceEnum.share);
  });

  it('should map iframe channel to share source', () => {
    expect(getChatSourceByPublishChannel(PublishChannelEnum.iframe)).toBe(ChatSourceEnum.share);
  });

  it('should map apikey channel to api source', () => {
    expect(getChatSourceByPublishChannel(PublishChannelEnum.apikey)).toBe(ChatSourceEnum.api);
  });

  it('should map feishu channel to feishu source', () => {
    expect(getChatSourceByPublishChannel(PublishChannelEnum.feishu)).toBe(ChatSourceEnum.feishu);
  });

  it('should map wecom channel to wecom source', () => {
    expect(getChatSourceByPublishChannel(PublishChannelEnum.wecom)).toBe(ChatSourceEnum.wecom);
  });

  it('should map officialAccount channel to official_account source', () => {
    expect(getChatSourceByPublishChannel(PublishChannelEnum.officialAccount)).toBe(
      ChatSourceEnum.official_account
    );
  });

  it('should default to online source for unknown channels', () => {
    expect(getChatSourceByPublishChannel('unknown' as PublishChannelEnum)).toBe(
      ChatSourceEnum.online
    );
  });
});

describe('getFlatAppResponses', () => {
  it('should flatten nested responses', () => {
    const responses: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Parent',
        moduleType: FlowNodeTypeEnum.toolCall,
        pluginDetail: [
          {
            id: '2',
            nodeId: 'node2',
            moduleName: 'Child',
            moduleType: FlowNodeTypeEnum.chatNode
          }
        ]
      }
    ];

    const result = getFlatAppResponses(responses);

    expect(result).toHaveLength(2);
  });

  it('should handle empty array', () => {
    const result = getFlatAppResponses([]);

    expect(result).toHaveLength(0);
  });

  it('should flatten deeply nested responses', () => {
    const responses: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Level 1',
        moduleType: FlowNodeTypeEnum.toolCall,
        toolDetail: [
          {
            id: '2',
            nodeId: 'node2',
            moduleName: 'Level 2',
            moduleType: FlowNodeTypeEnum.pluginModule,
            loopDetail: [
              {
                id: '3',
                nodeId: 'node3',
                moduleName: 'Level 3',
                moduleType: FlowNodeTypeEnum.chatNode
              }
            ]
          }
        ]
      }
    ];

    const result = getFlatAppResponses(responses);

    expect(result).toHaveLength(3);
  });

  it('should flatten deprecated parallelDetail and loopRunDetail responses', () => {
    const responses: ChatHistoryItemResType[] = [
      {
        id: 'parallel',
        nodeId: 'parallel-node',
        moduleName: 'Parallel',
        moduleType: FlowNodeTypeEnum.parallelRun,
        parallelDetail: [
          {
            id: 'task',
            nodeId: 'task-node',
            moduleName: 'Task',
            moduleType: FlowNodeTypeEnum.chatNode,
            loopRunDetail: [
              {
                id: 'loop-run',
                nodeId: 'loop-run-node',
                moduleName: 'Loop Run',
                moduleType: FlowNodeTypeEnum.loopRun
              }
            ]
          }
        ]
      }
    ];

    expect(getFlatAppResponses(responses).map((item) => item.id)).toEqual([
      'parallel',
      'task',
      'loop-run'
    ]);
  });

  it('should recurse into childrenResponses', () => {
    const responses: ChatHistoryItemResType[] = [
      {
        id: 'root',
        nodeId: 'root-node',
        moduleName: 'Root',
        moduleType: FlowNodeTypeEnum.agent,
        childrenResponses: [
          {
            id: 'child',
            nodeId: 'child-node',
            moduleName: 'Child',
            moduleType: FlowNodeTypeEnum.tool,
            childrenResponses: [
              {
                id: 'grandchild',
                nodeId: 'grandchild-node',
                moduleName: 'Grandchild',
                moduleType: FlowNodeTypeEnum.datasetSearchNode
              }
            ]
          }
        ]
      }
    ];

    expect(getFlatAppResponses(responses).map((item) => item.id)).toEqual([
      'root',
      'child',
      'grandchild'
    ]);
  });
});

describe('checkInteractiveResponseStatus', () => {
  it('should return query for agentPlanAskQuery type', () => {
    const result = checkInteractiveResponseStatus({
      interactive: { type: 'agentPlanAskQuery' },
      input: 'any input'
    });

    expect(result).toBe('query');
  });
});

describe('removeAIResponseCite', () => {
  it('should return value unchanged when retainCite is true', () => {
    const value: AIChatItemValueItemType[] = [
      { text: { content: 'Hello [507f1f77bcf86cd799439011](CITE)' } }
    ];

    const result = removeAIResponseCite(value, true);

    expect(result).toEqual(value);
  });

  it('should remove cite from string when retainCite is false', () => {
    const text = 'Hello [507f1f77bcf86cd799439011](CITE) world';

    const result = removeAIResponseCite(text, false);

    expect(result).toBe('Hello  world');
  });

  it('should remove cite from text content in value array', () => {
    const value: AIChatItemValueItemType[] = [
      { text: { content: 'Hello [507f1f77bcf86cd799439011](CITE) world' } }
    ];

    const result = removeAIResponseCite(value, false);

    expect(result[0].text?.content).toBe('Hello  world');
  });

  it('should remove cite from reasoning content in value array', () => {
    const value: AIChatItemValueItemType[] = [
      { reasoning: { content: 'Thinking [507f1f77bcf86cd799439011](CITE) process' } }
    ];

    const result = removeAIResponseCite(value, false);

    expect(result[0].reasoning?.content).toBe('Thinking  process');
  });

  it('should handle value items without text or reasoning', () => {
    const value: AIChatItemValueItemType[] = [
      {
        tools: [
          {
            id: 'tool1',
            toolName: 'Test Tool',
            toolAvatar: '',
            params: '{}',
            response: 'response',
            functionName: 'test'
          }
        ]
      }
    ];

    const result = removeAIResponseCite(value, false);

    expect(result[0].tools).toBeDefined();
  });

  it('should remove multiple cites from content', () => {
    const text =
      'First [507f1f77bcf86cd799439011](CITE) and second [607f1f77bcf86cd799439012](CITE)';

    const result = removeAIResponseCite(text, false);

    expect(result).toBe('First  and second ');
  });

  it('should handle empty string', () => {
    const result = removeAIResponseCite('', false);

    expect(result).toBe('');
  });

  it('should handle empty value array', () => {
    const result = removeAIResponseCite([], false);

    expect(result).toEqual([]);
  });

  it('should preserve other properties in value items', () => {
    const value: AIChatItemValueItemType[] = [
      {
        id: 'item1',
        text: { content: 'Hello [507f1f77bcf86cd799439011](CITE)' }
      }
    ];

    const result = removeAIResponseCite(value, false);

    expect(result[0].id).toBe('item1');
    expect(result[0].text?.content).toBe('Hello ');
  });
});
