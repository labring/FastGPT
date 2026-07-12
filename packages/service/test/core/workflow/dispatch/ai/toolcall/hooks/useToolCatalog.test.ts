import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useToolCatalog } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolCatalog';
import { READ_FILES_TOOL_NAME } from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { DATASET_SEARCH_TOOL_NAME } from '@fastgpt/service/core/ai/llm/agentLoop/interface';

const { getSandboxToolInfoMock } = vi.hoisted(() => ({
  getSandboxToolInfoMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/toolCall', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/interface/toolCall')>();

  return {
    ...original,
    getSandboxToolInfo: getSandboxToolInfoMock
  };
});

const createToolNode = (overrides: Record<string, any> = {}) =>
  ({
    nodeId: 'search',
    name: 'Search',
    avatar: 'tool-avatar',
    intro: 'Search intro',
    toolDescription: 'Search data',
    toolParams: [],
    ...overrides
  }) as any;

describe('useToolCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSandboxToolInfoMock.mockReturnValue(undefined);
    (global as any).feConfigs = {};
  });

  afterEach(() => {
    delete (global as any).feConfigs;
  });

  it('creates user tool schemas, read-file tool and tool info lookup', async () => {
    const explicitSchema = {
      type: 'object',
      properties: {
        q: { type: 'string' }
      }
    };
    const result = await useToolCatalog({
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: 'hello'
        }
      ],
      toolNodes: [
        createToolNode({
          nodeId: 'search',
          jsonSchema: explicitSchema
        }),
        createToolNode({
          nodeId: 'weather',
          name: 'Weather',
          toolDescription: '',
          intro: 'Weather intro',
          toolParams: [
            {
              key: 'city',
              valueType: WorkflowIOValueTypeEnum.string,
              toolDescription: 'City name',
              list: [
                { label: 'Hangzhou', value: 'Hangzhou' },
                { label: 'Shanghai', value: 'Shanghai' }
              ],
              required: true
            },
            {
              key: 'days',
              valueType: 'unknown',
              toolDescription: 'Days',
              required: false
            }
          ]
        })
      ],
      useAgentSandbox: false,
      lang: 'en' as any
    });

    expect(result.finalMessages).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'hello'
      }
    ]);
    expect(result.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'Search: Search data',
          parameters: explicitSchema
        }
      },
      {
        type: 'function',
        function: {
          name: 'weather',
          description: 'Weather: Weather intro',
          parameters: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                title: 'city',
                description: 'City name',
                toolDescription: 'City name',
                enum: ['Hangzhou', 'Shanghai']
              },
              days: {
                type: 'string',
                description: 'Days',
                title: 'days',
                toolDescription: 'Days'
              }
            },
            required: ['city']
          }
        }
      }
    ]);
    expect(result.getToolInfo('search')).toEqual({
      type: 'user',
      name: 'Search',
      avatar: 'tool-avatar',
      rawData: expect.objectContaining({
        nodeId: 'search'
      })
    });
    expect(result.getToolInfo(READ_FILES_TOOL_NAME)).toEqual(
      expect.objectContaining({
        type: 'file',
        name: expect.any(String),
        avatar: 'core/workflow/template/readFiles'
      })
    );
    expect(result.getToolInfo('missing')).toBeUndefined();
  });

  it('keeps dataset search nodes out of runtime tools but exposes system tool display info', async () => {
    const result = await useToolCatalog({
      messages: [],
      toolNodes: [
        createToolNode({
          nodeId: 'dataset_node',
          name: 'Dataset search node',
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode
        }),
        createToolNode({
          nodeId: 'search',
          name: 'Search'
        })
      ],
      useAgentSandbox: false,
      lang: 'en' as any
    });

    expect(result.tools.map((tool) => tool.function.name)).toEqual(['search']);
    expect(result.getToolInfo(DATASET_SEARCH_TOOL_NAME)).toEqual(
      expect.objectContaining({
        type: 'datasetSearch',
        name: expect.any(String),
        avatar: expect.any(String)
      })
    );
  });

  it('appends sandbox prompt when sandbox is enabled', async () => {
    (global as any).feConfigs = {
      show_agent_sandbox: true
    };
    getSandboxToolInfoMock.mockReturnValue({
      name: 'Run shell',
      avatar: 'sandbox-avatar'
    });

    const result = await useToolCatalog({
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: 'system prompt'
        },
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: 'hello'
        }
      ],
      toolNodes: [],
      useAgentSandbox: true,
      lang: 'en' as any
    });

    expect(result.tools).toEqual([]);
    expect(result.finalMessages[0]).toEqual({
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `system prompt\n\n${SANDBOX_SYSTEM_PROMPT}`
    });
    expect(result.getToolInfo('sandbox_shell')).toEqual({
      type: 'sandbox',
      name: 'Run shell',
      avatar: 'sandbox-avatar'
    });
  });

  it('prepends sandbox system prompt when original messages have no system message', async () => {
    (global as any).feConfigs = {
      show_agent_sandbox: true
    };

    const result = await useToolCatalog({
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: 'hello'
        }
      ],
      toolNodes: [],
      useAgentSandbox: true
    });

    expect(result.finalMessages).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: SANDBOX_SYSTEM_PROMPT
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'hello'
      }
    ]);
  });
});
