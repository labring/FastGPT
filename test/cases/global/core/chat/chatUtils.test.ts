import { describe, expect, it } from 'vitest';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatFileTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { ChatItemType, ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import {
  concatHistories,
  getChatTitleFromChatMessage,
  getHistoryPreview,
  filterPublicNodeResponseData,
  removeEmptyUserInput,
  getPluginOutputsFromChatResponses,
  getChatSourceByPublishChannel,
  getFlatAppResponses,
  checkInteractiveResponseStatus,
  mergeChatResponseData,
  removeAIResponseCite
} from '@fastgpt/global/core/chat/utils';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

describe('concatHistories', () => {
  it('should concat two history arrays', () => {
    const histories1: ChatItemType[] = [
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Hello' } }] }
    ];
    const histories2: ChatItemType[] = [
      { obj: ChatRoleEnum.AI, value: [{ text: { content: 'Hi there' } }] }
    ];

    const result = concatHistories(histories1, histories2);

    expect(result).toHaveLength(2);
  });

  it('should sort system messages first', () => {
    const histories1: ChatItemType[] = [
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Hello' } }] }
    ];
    const histories2: ChatItemType[] = [
      { obj: ChatRoleEnum.System, value: [{ text: { content: 'System prompt' } }] }
    ];

    const result = concatHistories(histories1, histories2);

    expect(result[0].obj).toBe(ChatRoleEnum.System);
  });
});

describe('getChatTitleFromChatMessage', () => {
  it('should extract title from text content', () => {
    const message: ChatItemType = {
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'This is a long message that should be truncated' } }]
    };

    const result = getChatTitleFromChatMessage(message);

    expect(result).toBe('This is a long messa');
    expect(result.length).toBe(20);
  });

  it('should return default value when message is undefined', () => {
    const result = getChatTitleFromChatMessage(undefined);

    expect(result).toBe('新对话');
  });

  it('should return default value when no text content', () => {
    const message: ChatItemType = {
      obj: ChatRoleEnum.Human,
      value: []
    };

    const result = getChatTitleFromChatMessage(message);

    expect(result).toBe('新对话');
  });

  it('should use custom default value', () => {
    const result = getChatTitleFromChatMessage(undefined, 'Custom Default');

    expect(result).toBe('Custom Default');
  });
});

describe('getHistoryPreview', () => {
  it('should return preview of messages', () => {
    const messages: ChatItemType[] = [
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Hello' } }] },
      { obj: ChatRoleEnum.AI, value: [{ text: { content: 'Hi there' } }] }
    ];

    const result = getHistoryPreview(messages);

    expect(result).toHaveLength(2);
    expect(result[0].obj).toBe(ChatRoleEnum.Human);
    expect(result[0].value).toContain('Hello');
  });

  it('should handle system messages', () => {
    const messages: ChatItemType[] = [
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
    expect(result[0].moduleType).toBe(FlowNodeTypeEnum.datasetSearchNode);
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
            updateTime: new Date(),
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
});

describe('checkInteractiveResponseStatus', () => {
  it('should return query for agentPlanAskQuery type', () => {
    const result = checkInteractiveResponseStatus({
      interactive: { type: 'agentPlanAskQuery' },
      input: 'any input'
    });

    expect(result).toBe('query');
  });

  it('should return query for agentPlanAskUserForm with invalid JSON', () => {
    const result = checkInteractiveResponseStatus({
      interactive: { type: 'agentPlanAskUserForm' },
      input: 'not json'
    });

    expect(result).toBe('query');
  });

  it('should return submit for agentPlanAskUserForm with valid JSON', () => {
    const result = checkInteractiveResponseStatus({
      interactive: { type: 'agentPlanAskUserForm' },
      input: '{"field": "value"}'
    });

    expect(result).toBe('submit');
  });

  it('should return query for agentPlanCheck with non-confirm input', () => {
    const result = checkInteractiveResponseStatus({
      interactive: { type: 'agentPlanCheck' },
      input: 'some other input'
    });

    expect(result).toBe('query');
  });

  it('should return submit for agentPlanCheck with confirm input', () => {
    const result = checkInteractiveResponseStatus({
      interactive: { type: 'agentPlanCheck' },
      input: 'CONFIRM'
    });

    expect(result).toBe('submit');
  });
});

describe('mergeChatResponseData', () => {
  it('should merge items with same mergeSignId', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Tool',
        moduleType: FlowNodeTypeEnum.toolCall,
        mergeSignId: 'merge-1',
        runningTime: 1,
        totalPoints: 10
      },
      {
        id: '2',
        nodeId: 'node1',
        moduleName: 'Tool',
        moduleType: FlowNodeTypeEnum.toolCall,
        mergeSignId: 'merge-1',
        runningTime: 2,
        totalPoints: 20
      }
    ];

    const result = mergeChatResponseData(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].runningTime).toBe(3);
    expect(result[0].totalPoints).toBe(30);
  });

  it('should not merge items without mergeSignId', () => {
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

    const result = mergeChatResponseData(responseDataList);

    expect(result).toHaveLength(2);
  });

  it('should handle empty array', () => {
    const result = mergeChatResponseData([]);

    expect(result).toHaveLength(0);
  });

  it('should merge nested details recursively', () => {
    const responseDataList: ChatHistoryItemResType[] = [
      {
        id: '1',
        nodeId: 'node1',
        moduleName: 'Tool',
        moduleType: FlowNodeTypeEnum.toolCall,
        mergeSignId: 'merge-1',
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
        id: '2',
        nodeId: 'node1',
        moduleName: 'Tool',
        moduleType: FlowNodeTypeEnum.toolCall,
        mergeSignId: 'merge-1',
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

    const result = mergeChatResponseData(responseDataList);

    expect(result).toHaveLength(1);
    expect(result[0].toolDetail).toHaveLength(2);
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
        tool: {
          id: 'tool1',
          toolName: 'Test Tool',
          toolAvatar: '',
          params: '{}',
          response: 'response',
          functionName: 'test'
        }
      }
    ];

    const result = removeAIResponseCite(value, false);

    expect(result[0].tool).toBeDefined();
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
