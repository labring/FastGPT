import { createWorkflowAgentToolProvider as createWorkflowAgentToolProviderWithoutContext } from '@fastgpt/service/core/workflow/dispatch/ai/agent/toolProvider';
import {
  getWorkflowFileContext,
  runWithContext
} from '@fastgpt/service/core/workflow/utils/context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { describe, expect, it, vi } from 'vitest';

const { dispatchWorkflowReadFilesMock, dispatchAgentDatasetSearchMock } = vi.hoisted(() => ({
  dispatchWorkflowReadFilesMock: vi.fn(),
  dispatchAgentDatasetSearchMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/readFiles', () => ({
  dispatchWorkflowReadFiles: dispatchWorkflowReadFilesMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset', () => ({
  dispatchAgentDatasetSearch: dispatchAgentDatasetSearchMock
}));

const createWorkflowAgentToolProvider: typeof createWorkflowAgentToolProviderWithoutContext = (
  props
) => {
  if (getWorkflowFileContext()) return createWorkflowAgentToolProviderWithoutContext(props);

  return runWithContext(
    {
      mcpClientMemory: {},
      fileContext: {
        limits: { maxFileAmount: 20, maxBytesPerFile: 1024 }
      } as any
    },
    () => createWorkflowAgentToolProviderWithoutContext(props)
  );
};

const createContext = (overrides: Record<string, any> = {}) =>
  ({
    completionTools: [
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'Search',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      }
    ],
    getSubApp: (id: string) =>
      id === 'search'
        ? {
            type: 'workflow',
            id: 'search',
            name: 'Search',
            avatar: 'tool-avatar'
          }
        : undefined,
    getSubAppInfo: (id: string) => ({
      name: id,
      avatar: ''
    }),
    params: {
      model: 'gpt-4'
    },
    currentFiles: [],
    runningUserInfo: {
      teamId: 'team_1',
      tmbId: 'tmb_1'
    },
    chatConfig: {},
    externalProvider: {},
    ...overrides
  }) as any;

describe('createWorkflowAgentToolProvider', () => {
  it('uses the current Workflow FileContext maxFileAmount limit', () => {
    const provider = runWithContext(
      {
        mcpClientMemory: {},
        fileContext: {
          limits: {
            maxFileAmount: 4,
            maxBytesPerFile: 1024
          }
        } as any
      },
      () =>
        createWorkflowAgentToolProvider({
          context: createContext({
            chatConfig: {
              fileSelectConfig: {
                maxFiles: 9
              }
            }
          })
        })
    );

    expect(provider.readFileMaxFileAmount).toBe(4);
  });

  it('exposes Workflow Agent runtime tools and tool info through the core provider protocol', () => {
    const provider = createWorkflowAgentToolProvider({
      context: createContext()
    });

    expect(provider.buildRuntimeTools()).toEqual([
      expect.objectContaining({
        function: expect.objectContaining({
          name: 'search'
        })
      })
    ]);
    expect(provider.getToolInfo('search')).toEqual({
      type: 'user',
      name: 'Search',
      avatar: 'tool-avatar',
      rawData: expect.objectContaining({
        id: 'search'
      })
    });
    expect(provider.getToolInfo('missing')).toBeUndefined();
  });

  it('executes workflow tools through the injected executor factory', async () => {
    const executeToolMock = vi.fn().mockResolvedValue({
      response: 'tool result',
      usages: [{ moduleName: 'tool', totalPoints: 1 }],
      stop: true
    });
    const executeToolFactory = vi.fn(() => executeToolMock);
    const provider = createWorkflowAgentToolProvider({
      context: createContext(),
      executeToolFactory: executeToolFactory as any
    });

    await expect(
      provider.executeTool({
        call: {
          id: 'call_search',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"q":"FastGPT"}'
          }
        } as any,
        messages: []
      })
    ).resolves.toEqual({
      response: 'tool result',
      usages: [{ moduleName: 'tool', totalPoints: 1 }],
      stop: true
    });
    expect(executeToolFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        completionTools: [
          expect.objectContaining({
            function: expect.objectContaining({
              name: 'search'
            })
          })
        ]
      })
    );
    expect(executeToolMock).toHaveBeenCalledWith({
      callId: 'call_search',
      toolId: 'search',
      args: '{"q":"FastGPT"}'
    });
  });

  it('resumes an interactive workflow tool with the original call data', async () => {
    const nextInteractive = {
      type: 'userInput',
      entryNodeIds: ['input_2']
    };
    const executeToolMock = vi.fn().mockResolvedValue({
      response: 'waiting again',
      interactive: nextInteractive
    });
    const provider = createWorkflowAgentToolProvider({
      context: createContext(),
      executeToolFactory: vi.fn(() => executeToolMock) as any
    });
    const previousInteractive = {
      type: 'userSelect',
      entryNodeIds: ['select_1']
    };

    await expect(
      provider.executeInteractiveTool?.({
        call: {
          id: 'call_search',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"q":"FastGPT"}'
          }
        } as any,
        messages: [{ role: 'user', content: 'search FastGPT' }],
        childrenResponse: previousInteractive as any,
        toolParams: {
          toolCallId: 'call_search'
        }
      })
    ).resolves.toEqual({
      response: 'waiting again',
      interactive: nextInteractive
    });
    expect(executeToolMock).toHaveBeenCalledWith({
      callId: 'call_search',
      toolId: 'search',
      args: '{"q":"FastGPT"}',
      lastInteractive: previousInteractive
    });
  });

  it('creates read file executor for direct model URLs', async () => {
    const response = JSON.stringify([
      {
        name: 'result.pdf',
        content: 'file content'
      }
    ]);
    dispatchWorkflowReadFilesMock.mockResolvedValue({
      response,
      usages: [],
      nodeResponse: {
        moduleName: 'File parse'
      }
    });
    const provider = createWorkflowAgentToolProvider({
      context: createContext({
        usageId: 'usage_1',
        requestOrigin: 'https://fastgpt.example.com'
      })
    });

    expect(provider.readFileExecutor).toBeDefined();

    const result = await provider.readFileExecutor!({
      messages: [],
      call: {
        id: 'call_read',
        type: 'function',
        function: {
          name: 'read_files',
          arguments:
            '{"urls":["https://fastgpt.example.com/api/system/file/d/a","https://generated.example.com/result.pdf"]}'
        }
      } as any
    });

    expect(dispatchWorkflowReadFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          { url: 'https://fastgpt.example.com/api/system/file/d/a' },
          { url: 'https://generated.example.com/result.pdf' }
        ],
        teamId: 'team_1',
        tmbId: 'tmb_1',
        usageId: 'usage_1'
      })
    );
    expect(result.metadata).toEqual(
      expect.objectContaining({
        id: 'call_read',
        nodeId: 'call_read',
        moduleName: 'File parse'
      })
    );
    expect(result.response).toBe(response);
  });

  it('creates dataset search executor and current input files from workflow agent context', async () => {
    dispatchAgentDatasetSearchMock.mockResolvedValue({
      response: 'dataset content',
      usages: [{ moduleName: 'Dataset search', totalPoints: 2 }],
      nodeResponse: {
        moduleName: 'Dataset search'
      }
    });
    const provider = createWorkflowAgentToolProvider({
      context: createContext({
        requestOrigin: 'https://fastgpt.example.com',
        currentFiles: [
          {
            url: 'https://fastgpt.example.com/api/file/image.png'
          }
        ],
        params: {
          model: 'gpt-4',
          agent_datasetParams: {
            datasets: [{ datasetId: 'dataset_1' }]
          }
        },
        externalProvider: {
          openaiAccount: {
            key: 'user-key'
          }
        }
      })
    });

    expect(provider.currentInputFiles).toEqual(['https://fastgpt.example.com/api/file/image.png']);
    expect(provider.datasetSearchExecutor).toBeDefined();

    const result = await provider.datasetSearchExecutor!({
      messages: [],
      call: {
        id: 'call_dataset',
        type: 'function',
        function: {
          name: 'dataset_search',
          arguments: '{"query":["FastGPT"]}'
        }
      } as any
    });

    expect(dispatchAgentDatasetSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        args: '{"query":["FastGPT"]}',
        datasetParams: {
          datasets: [{ datasetId: 'dataset_1' }]
        },
        llmModel: 'gpt-4',
        userKey: {
          key: 'user-key'
        }
      })
    );
    expect(result.metadata).toEqual(
      expect.objectContaining({
        id: 'call_dataset',
        nodeId: 'call_dataset',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Dataset search',
        totalPoints: 2
      })
    );
  });

  it('supports upstream main split dataset parameters', async () => {
    dispatchAgentDatasetSearchMock.mockResolvedValue({
      response: 'dataset content',
      usages: []
    });
    const provider = createWorkflowAgentToolProvider({
      context: createContext({
        params: {
          model: 'gpt-4',
          datasets: [{ datasetId: 'dataset_legacy' }],
          similarity: 0.55,
          limit: 3000,
          searchMode: 'embedding',
          embeddingWeight: 0.7,
          usingReRank: true,
          rerankModel: 'rerank-model',
          rerankWeight: 0.8,
          datasetSearchUsingExtensionQuery: true,
          datasetSearchExtensionModel: 'extension-model',
          datasetSearchExtensionBg: 'background',
          authTmbId: true
        }
      })
    });

    expect(provider.datasetSearchExecutor).toBeDefined();

    await provider.datasetSearchExecutor!({
      messages: [],
      call: {
        id: 'call_legacy_dataset',
        type: 'function',
        function: {
          name: 'dataset_search',
          arguments: '{"query":["FastGPT"]}'
        }
      } as any
    });

    expect(dispatchAgentDatasetSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetParams: {
          datasets: [{ datasetId: 'dataset_legacy' }],
          similarity: 0.55,
          limit: 3000,
          searchMode: 'embedding',
          embeddingWeight: 0.7,
          usingReRank: true,
          rerankModel: 'rerank-model',
          rerankWeight: 0.8,
          datasetSearchUsingExtensionQuery: true,
          datasetSearchExtensionModel: 'extension-model',
          datasetSearchExtensionBg: 'background',
          authTmbId: true
        }
      })
    );
  });
});
