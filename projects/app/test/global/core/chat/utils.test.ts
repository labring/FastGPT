import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { addStatisticalDataToHistoryItem } from '@/global/core/chat/utils';

describe('addStatisticalDataToHistoryItem', () => {
  it('marks sandbox usage from streaming tool call cards before responseData is loaded', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          tools: [
            {
              id: 'call-sandbox',
              toolName: 'Sandbox',
              toolAvatar: '',
              functionName: SANDBOX_SHELL_TOOL_NAME,
              params: '{"cmd":"pwd"}'
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox).toBe(true);
  });

  it('marks sandbox usage when a nested response calls any sandbox tool', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'agent-response',
          nodeId: 'agent-node',
          moduleName: 'Agent',
          moduleType: FlowNodeTypeEnum.agent,
          childrenResponses: [
            {
              id: 'sandbox-response',
              nodeId: 'sandbox-node',
              moduleName: 'Read file',
              moduleType: FlowNodeTypeEnum.tool,
              toolId: SANDBOX_READ_FILE_TOOL_NAME
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox).toBe(true);
  });

  it('marks sandbox usage when a childrenResponses item calls any sandbox tool', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'agent-response',
          nodeId: 'agent-node',
          moduleName: 'Agent',
          moduleType: FlowNodeTypeEnum.agent,
          childrenResponses: [
            {
              id: 'sandbox-response',
              nodeId: 'sandbox-node',
              moduleName: 'Read file',
              moduleType: FlowNodeTypeEnum.tool,
              toolId: SANDBOX_READ_FILE_TOOL_NAME
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox).toBe(true);
  });

  it('includes dataset quote tags from childrenResponses', () => {
    const quoteId = '507f1f77bcf86cd799439011';
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: `done [${quoteId}](QUOTE)`
          }
        }
      ],
      responseData: [
        {
          id: 'agent-response',
          nodeId: 'agent-node',
          moduleName: 'Agent',
          moduleType: FlowNodeTypeEnum.agent,
          childrenResponses: [
            {
              id: 'dataset-response',
              nodeId: 'dataset-node',
              moduleName: 'Dataset Search',
              moduleType: FlowNodeTypeEnum.datasetSearchNode,
              quoteList: [
                {
                  id: quoteId,
                  chunkIndex: 0,
                  datasetId: 'dataset-1',
                  collectionId: 'collection-1',
                  sourceName: 'doc.pdf',
                  score: [{ type: 'embedding', value: 0.9, index: 0 }]
                }
              ]
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).totalQuoteList).toHaveLength(1);
  });

  it('deduplicates dataset quote tags by cited quote id', () => {
    const quoteId = '507f1f77bcf86cd799439011';
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: `done [${quoteId}](QUOTE)`
          }
        }
      ],
      responseData: [
        {
          id: 'dataset-response-1',
          nodeId: 'dataset-node-1',
          moduleName: 'Dataset Search 1',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          quoteList: [
            {
              id: quoteId,
              chunkIndex: 0,
              datasetId: 'dataset-1',
              collectionId: 'collection-1',
              sourceName: 'doc.pdf',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
            }
          ]
        },
        {
          id: 'dataset-response-2',
          nodeId: 'dataset-node-2',
          moduleName: 'Dataset Search 2',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          quoteList: [
            {
              id: quoteId,
              chunkIndex: 0,
              datasetId: 'dataset-1',
              collectionId: 'collection-1',
              sourceName: 'doc.pdf',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
            }
          ]
        }
      ]
    };

    expect(
      addStatisticalDataToHistoryItem(historyItem).totalQuoteList?.map((quote) => quote.id)
    ).toEqual([quoteId]);
  });

  it('does not mark non-sandbox tools as sandbox usage', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'tool-response',
          nodeId: 'tool-node',
          moduleName: 'HTTP tool',
          moduleType: FlowNodeTypeEnum.tool,
          toolId: 'http-tool'
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox).toBe(false);
  });

  it('does not treat object prototype fields as sandbox tool ids', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'tool-response',
          nodeId: 'tool-node',
          moduleName: 'Unexpected tool',
          moduleType: FlowNodeTypeEnum.tool,
          toolId: 'toString'
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox).toBe(false);
  });

  it('uses node error as chat bubble error text when errorText is absent', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'http-response',
          nodeId: 'http-node',
          moduleName: 'HTTP 请求',
          moduleType: FlowNodeTypeEnum.httpRequest468,
          error: 'connect ECONNREFUSED 127.0.0.1:3000'
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toEqual({
      moduleName: 'HTTP 请求',
      errorText: 'connect ECONNREFUSED 127.0.0.1:3000'
    });
  });

  it('uses the last node error as chat bubble error text when multiple nodes fail', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'http-response',
          nodeId: 'http-node',
          moduleName: 'HTTP 请求',
          moduleType: FlowNodeTypeEnum.httpRequest468,
          errorText: 'upstream timeout'
        },
        {
          id: 'agent-response',
          nodeId: 'agent-node',
          moduleName: 'Agent',
          moduleType: FlowNodeTypeEnum.agent,
          errorText: 'agent stopped'
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toEqual({
      moduleName: 'Agent',
      errorText: 'agent stopped'
    });
  });

  it('ignores captured node errors when building chat bubble error text', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'http-response',
          nodeId: 'http-node',
          moduleName: 'HTTP 请求',
          moduleType: FlowNodeTypeEnum.httpRequest468,
          errorText: 'upstream timeout',
          errorCaptured: true
        },
        {
          id: 'answer-response',
          nodeId: 'answer-node',
          moduleName: '指定回复',
          moduleType: FlowNodeTypeEnum.answerNode,
          textOutput: 'fallback answer'
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toBeUndefined();
  });

  it('uses later uncaptured errors after captured node errors', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'http-response',
          nodeId: 'http-node',
          moduleName: 'HTTP 请求',
          moduleType: FlowNodeTypeEnum.httpRequest468,
          errorText: 'captured timeout',
          errorCaptured: true
        },
        {
          id: 'agent-response',
          nodeId: 'agent-node',
          moduleName: 'Agent',
          moduleType: FlowNodeTypeEnum.agent,
          errorText: 'agent stopped'
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toEqual({
      moduleName: 'Agent',
      errorText: 'agent stopped'
    });
  });

  it('does not use HTTP result error as chat bubble error text when node error is absent', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'done'
          }
        }
      ],
      responseData: [
        {
          id: 'http-response',
          nodeId: 'http-node',
          moduleName: 'HTTP 请求',
          moduleType: FlowNodeTypeEnum.httpRequest468,
          httpResult: {
            error: {
              message: 'Request failed with status code 500',
              status: 500,
              data: {
                message: 'upstream failed'
              }
            }
          }
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toBeUndefined();
  });

  it('includes dataset quote tags that use QUOTE markdown links', () => {
    const quoteId = '507f1f77bcf86cd799439011';
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: `done [${quoteId}](QUOTE)`
          }
        }
      ],
      responseData: [
        {
          id: 'dataset-response',
          nodeId: 'dataset-node',
          moduleName: 'Dataset Search',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          quoteList: [
            {
              id: quoteId,
              chunkIndex: 0,
              datasetId: 'dataset-1',
              collectionId: 'collection-1',
              sourceName: 'doc.pdf',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).totalQuoteList).toHaveLength(1);
  });
});
