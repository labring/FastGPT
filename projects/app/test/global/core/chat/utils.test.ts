import { describe, expect, it } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { addStatisticalDataToHistoryItem, getChatItemErrorText } from '@/global/core/chat/utils';

describe('addStatisticalDataToHistoryItem', () => {
  it.each([
    ['workflow_cli_query', true],
    ['workflow_cli_stage', true],
    ['workflow_cli_commit', true],
    ['workflow_builder_present_preview', false],
    ['workflow_builder_cancel', false]
  ])('marks Workflow Builder tool %s sandbox usage as %s', (functionName, expected) => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [
        {
          tools: [
            {
              id: `call-${functionName}`,
              toolName: functionName,
              toolAvatar: '',
              functionName,
              params: '{}'
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).useAgentSandbox === true).toBe(expected);
  });

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

  it('ignores a failed tool child when later tool calls complete', () => {
    const responseData: NonNullable<ChatItemMiniType['responseData']> = [
      {
        id: 'agent-response',
        nodeId: 'agent-node',
        moduleName: 'Agent',
        moduleType: FlowNodeTypeEnum.agent
      },
      {
        id: 'tool-response-1',
        parentId: 'agent-response',
        nodeId: 'tool-node-1',
        moduleName: 'Tool 1',
        moduleType: FlowNodeTypeEnum.tool,
        toolRes: 'done'
      },
      {
        id: 'tool-response-2',
        parentId: 'agent-response',
        nodeId: 'tool-node-2',
        moduleName: 'Tool 2',
        moduleType: FlowNodeTypeEnum.tool,
        error: 'tool failed'
      },
      {
        id: 'tool-response-3',
        parentId: 'agent-response',
        nodeId: 'tool-node-3',
        moduleName: 'Tool 3',
        moduleType: FlowNodeTypeEnum.tool,
        toolRes: 'done'
      },
      {
        id: 'tool-response-4',
        parentId: 'agent-response',
        nodeId: 'tool-node-4',
        moduleName: 'Tool 4',
        moduleType: FlowNodeTypeEnum.tool,
        toolRes: 'done'
      }
    ];
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'done' } }],
      responseData
    };

    expect(getChatItemErrorText(responseData)).toBeUndefined();
    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toBeUndefined();
  });

  it('ignores tool errors nested inside an agent response', () => {
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'done' } }],
      responseData: [
        {
          id: 'agent-response',
          nodeId: 'agent-node',
          moduleName: 'Agent',
          moduleType: FlowNodeTypeEnum.agent,
          childrenResponses: [
            {
              id: 'tool-response',
              nodeId: 'tool-node',
              moduleName: 'Tool',
              moduleType: FlowNodeTypeEnum.tool,
              errorText: 'tool failed'
            }
          ]
        }
      ]
    };

    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toBeUndefined();
  });

  it('ignores flat tool execution errors without parentId (e.g. sandbox tools)', () => {
    const responseData: NonNullable<ChatItemMiniType['responseData']> = [
      {
        id: 'sandbox-tool-response',
        nodeId: 'sandbox-tool-node',
        moduleName: '虚拟机/列出目录',
        moduleType: FlowNodeTypeEnum.tool,
        toolInput: { path: '/user_files' },
        toolRes: 'Tool error: file not found. lstat /user_files: no such file or directory',
        errorText: 'Tool error: file not found. lstat /user_files: no such file or directory'
      }
    ];
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: '该文件夹不存在。' } }],
      responseData
    };

    expect(getChatItemErrorText(responseData)).toBeUndefined();
    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toBeUndefined();
  });

  it('ignores subApp tool execution errors without parentId carrying toolRes', () => {
    const responseData: NonNullable<ChatItemMiniType['responseData']> = [
      {
        id: 'subapp-tool-response',
        nodeId: 'subapp-tool-node',
        moduleName: '子应用工具',
        moduleType: FlowNodeTypeEnum.appModule,
        toolInput: { query: 'test' },
        toolRes: 'Tool error: failed to execute sub-app',
        errorText: 'Tool error: failed to execute sub-app'
      }
    ];
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: '执行失败，已尝试备选方案。' } }],
      responseData
    };

    expect(getChatItemErrorText(responseData)).toBeUndefined();
    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toBeUndefined();
  });

  it('preserves root node errors when flat tool responses are present', () => {
    const responseData: NonNullable<ChatItemMiniType['responseData']> = [
      {
        id: 'tool-response',
        nodeId: 'tool-node',
        moduleName: '虚拟机/列出目录',
        moduleType: FlowNodeTypeEnum.tool,
        toolRes: 'Tool error: file not found',
        errorText: 'Tool error: file not found'
      },
      {
        id: 'main-agent-response',
        nodeId: 'main-agent-node',
        moduleName: '主模型',
        moduleType: FlowNodeTypeEnum.agent,
        errorText: 'Quota exhausted'
      }
    ];
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: '' } }],
      responseData
    };

    expect(getChatItemErrorText(responseData)).toEqual({
      moduleName: '主模型',
      errorText: 'Quota exhausted'
    });
    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toEqual({
      moduleName: '主模型',
      errorText: 'Quota exhausted'
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

  it('preserves unhandled orphan child node error when parent container crashed', () => {
    const responseData: NonNullable<ChatItemMiniType['responseData']> = [
      {
        id: 'orphan-code-node',
        nodeId: 'orphan-code-node',
        moduleName: '代码运行',
        moduleType: FlowNodeTypeEnum.code,
        parentId: 'crashed-container',
        errorText: 'Process killed: out of memory'
      }
    ];
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: '' } }],
      responseData
    };

    expect(getChatItemErrorText(responseData)).toEqual({
      moduleName: '代码运行',
      errorText: 'Process killed: out of memory'
    });
    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toEqual({
      moduleName: '代码运行',
      errorText: 'Process killed: out of memory'
    });
  });

  it('preserves standalone canvas pluginModule error', () => {
    const responseData: NonNullable<ChatItemMiniType['responseData']> = [
      {
        id: 'canvas-plugin-node',
        nodeId: 'canvas-plugin-node',
        moduleName: '插件模块',
        moduleType: FlowNodeTypeEnum.pluginModule,
        toolInput: { query: 'test' },
        errorText: 'Plugin failed'
      }
    ];
    const historyItem: ChatItemMiniType = {
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: '' } }],
      responseData
    };

    expect(getChatItemErrorText(responseData)).toEqual({
      moduleName: '插件模块',
      errorText: 'Plugin failed'
    });
    expect(addStatisticalDataToHistoryItem(historyItem).errorText).toEqual({
      moduleName: '插件模块',
      errorText: 'Plugin failed'
    });
  });
});
