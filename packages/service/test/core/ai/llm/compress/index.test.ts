import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createLLMResponseMock,
  countGptMessagesTokensMock,
  countPromptTokensMock,
  formatModelChars2PointsMock
} = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn(),
  countGptMessagesTokensMock: vi.fn(),
  countPromptTokensMock: vi.fn(),
  formatModelChars2PointsMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countGptMessagesTokens: countGptMessagesTokensMock,
  countPromptTokens: countPromptTokensMock
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: countGptMessagesTokensMock,
  countPromptTokens: countPromptTokensMock
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: formatModelChars2PointsMock
}));

import {
  compressLargeContent,
  compressRequestMessages,
  compressToolResponse
} from '@fastgpt/service/core/ai/llm/compress';
import { extractExactAnchors } from '@fastgpt/service/core/ai/llm/compress/prompt';

const model: LLMModelItemType = {
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'gpt-4',
  name: 'GPT-4',
  maxContext: 4000,
  maxResponse: 1024,
  quoteMaxToken: 2000,
  functionCall: true,
  toolChoice: true,
  reasoning: false
};

const createMessages = (): ChatCompletionMessageParam[] => [
  {
    role: ChatCompletionRequestMessageRoleEnum.System,
    content: 'system prompt'
  },
  {
    dataId: 'history-user-1',
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: 'old user 1'
  },
  {
    dataId: 'history-ai-1',
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: 'old assistant 1'
  },
  {
    dataId: 'history-user-2',
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: 'old user 2'
  },
  {
    dataId: 'history-ai-2',
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: 'old assistant 2'
  },
  {
    dataId: 'history-user-3',
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: 'recent user 3'
  }
];

const searchTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search',
    description: 'Search test data',
    parameters: {
      type: 'object',
      properties: {
        q: {
          type: 'string'
        }
      },
      required: ['q']
    }
  }
};

const mockDefaultUsagePoints = () => {
  formatModelChars2PointsMock.mockReturnValue({
    totalPoints: 3
  });
};

const mockPromptTokensForLlmCompression = ({
  cleanedTokens = 1000,
  finalTokens = 50,
  initialTokens = 1000
}: {
  cleanedTokens?: number;
  finalTokens?: number;
  initialTokens?: number;
} = {}) => {
  countPromptTokensMock
    .mockResolvedValueOnce(initialTokens)
    .mockResolvedValueOnce(cleanedTokens)
    .mockResolvedValueOnce(cleanedTokens)
    .mockResolvedValueOnce(finalTokens)
    .mockResolvedValue(initialTokens);
};

describe('compressRequestMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultUsagePoints();
    countPromptTokensMock.mockResolvedValue(100);
    countGptMessagesTokensMock.mockImplementation(
      async ({ messages }: { messages: ChatCompletionMessageParam[] }) => messages.length * 1000
    );
  });

  it('should compress all non-system messages into one hidden context checkpoint', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '# Context Checkpoint\nold task summary',
      usage: {
        inputTokens: 120,
        outputTokens: 30
      },
      requestId: 'req_compress',
      finish_reason: 'stop'
    });

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.messages).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content:
          '<context_checkpoint>\n# Context Checkpoint\nold task summary\n</context_checkpoint>',
        hideInUI: true
      }
    ]);
    expect(result.contextCheckpoint).toBe(
      '<context_checkpoint>\n# Context Checkpoint\nold task summary\n</context_checkpoint>'
    );
    expect(result.usage).toEqual({
      moduleName: 'account_usage:compress_llm_messages',
      model: 'GPT-4',
      totalPoints: 3,
      inputTokens: 120,
      outputTokens: 30
    });
    expect(result.requestIds).toEqual(['req_compress']);

    const [systemPromptMessage, userPromptMessage] =
      createLLMResponseMock.mock.calls[0][0].body.messages;
    const compressPrompt = systemPromptMessage.content;
    const userPrompt = userPromptMessage.content;
    expect(compressPrompt).not.toContain('目标长度');
    expect(compressPrompt).not.toContain('targetTokens');
    expect(compressPrompt).not.toContain('recent user 3');
    expect(userPrompt).toContain('<histories>');
    expect(userPrompt).toContain('recent user 3');
    expect(userPrompt).toContain('<output_budget>');
    expect(userPrompt).toContain('Target maximum output tokens: 4096');
    expect(compressPrompt).not.toContain('最近消息预览');
    expect(createLLMResponseMock.mock.calls[0][0].body.max_tokens).toBeUndefined();
  });

  it('should pass reasoning effort to the checkpoint compression LLM request', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 120,
        outputTokens: 30
      },
      requestId: 'req_reasoning_compress',
      finish_reason: 'stop'
    });

    await compressRequestMessages({
      messages: createMessages(),
      model,
      reasoningEffort: 'none'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body.reasoning_effort).toBe('none');
  });

  it('should preserve developer messages with system messages', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 10,
        outputTokens: 5
      },
      requestId: 'req_developer',
      finish_reason: 'stop'
    });

    const developerMessage: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Developer,
      content: 'developer prompt'
    };
    const baseMessages = createMessages();
    const messages = [baseMessages[0], developerMessage, ...baseMessages.slice(1)];
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result.messages.slice(0, 2)).toEqual([baseMessages[0], developerMessage]);
  });

  it('should normalize tagged checkpoint content from fenced or explained LLM output', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText:
        '额外说明\n```markdown\n<context_checkpoint>\nkeep only this\n</context_checkpoint>\n```\n尾部说明',
      usage: {
        inputTokens: 30,
        outputTokens: 10
      },
      requestId: 'req_tagged',
      finish_reason: 'stop'
    });

    const result = await compressRequestMessages({
      messages: createMessages(),
      model
    });

    expect(result.contextCheckpoint).toBe(
      '<context_checkpoint>\nkeep only this\n</context_checkpoint>'
    );
  });

  it('should keep the LLM checkpoint when completion output exceeds half context', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(2800);
    createLLMResponseMock.mockResolvedValue({
      answerText:
        '<context_checkpoint>\n# Context Checkpoint\n## User Goal\n保留完整语义摘要，而不是首尾截断。\n</context_checkpoint>',
      usage: {
        inputTokens: 500,
        outputTokens: 3000
      },
      requestId: 'req_soft_budget',
      finish_reason: 'stop'
    });

    const result = await compressRequestMessages({
      messages: createMessages(),
      model
    });

    expect(result.contextCheckpoint).toContain('保留完整语义摘要');
    expect(result.contextCheckpoint).not.toContain('## Source History Excerpts');
    expect(createLLMResponseMock.mock.calls[0][0].body.max_tokens).toBeUndefined();
  });

  it('should keep the LLM checkpoint when final checkpoint tokens still exceed threshold', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(4500);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nLLM checkpoint summary\n</context_checkpoint>',
      usage: {
        inputTokens: 500,
        outputTokens: 1000
      },
      requestId: 'req_llm_checkpoint_only',
      finish_reason: 'stop'
    });

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.messages).not.toBe(messages);
    expect(result.messageTokens).toBe(4500);
    expect(result.contextCheckpoint).toBe(
      '<context_checkpoint>\nLLM checkpoint summary\n</context_checkpoint>'
    );
    expect(result.contextCheckpoint).not.toContain('## Source History Excerpts');
    expect(countGptMessagesTokensMock).toHaveBeenCalledTimes(2);
  });

  it('should keep original messages when below compression threshold', async () => {
    countGptMessagesTokensMock.mockResolvedValue(100);

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result).toEqual({ messages, messageTokens: 100 });
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should include tools schema when counting request message tokens', async () => {
    countGptMessagesTokensMock.mockResolvedValue(100);
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'hello'
      }
    ];

    const result = await compressRequestMessages({
      messages,
      model,
      tools: [searchTool]
    });

    expect(result).toEqual({ messages, messageTokens: 100 });
    expect(countGptMessagesTokensMock).toHaveBeenCalledWith({
      messages,
      tools: [searchTool]
    });
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should reuse provided request message token count', async () => {
    const messages = createMessages();
    const result = await compressRequestMessages({
      messageTokens: 100,
      messages,
      model
    });

    expect(result).toEqual({ messages, messageTokens: 100 });
    expect(countGptMessagesTokensMock).not.toHaveBeenCalled();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should send formatted user and assistant content to LLM for over-threshold tool-call histories', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(1200);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\norders summary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_formatted_tool_history',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content:
          'Case alpha. Available tools: [{"type":"function","function":{"name":"search_orders","parameters":{"properties":{"customerId":{"type":"string"}}}}}]'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Find recent orders for customer c_123.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: null,
        tool_calls: [
          {
            id: 'call_search_orders',
            type: 'function',
            function: {
              name: 'search_orders',
              arguments: '{"customerId":"c_123","limit":5}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search_orders',
        content: '{"orders":[{"id":"ord_1","status":"paid"}]}'
      }
    ];

    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.contextCheckpoint).toBe(
      '<context_checkpoint>\norders summary\n</context_checkpoint>'
    );
    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(userPrompt).toContain('<histories>');
    expect(userPrompt).toContain('"role": "user"');
    expect(userPrompt).toContain('"role": "assistant"');
    expect(userPrompt).toContain('Find recent orders for customer c_123');
    expect(userPrompt).toContain('<tools>');
    expect(userPrompt).toContain('<tool name=\\"search_orders\\">');
    expect(userPrompt).toContain('<param>{\\"customerId\\":\\"c_123\\",\\"limit\\":5}</param>');
    expect(userPrompt).toContain('<response>');
    expect(userPrompt).toContain('ord_1');
    expect(userPrompt).toContain('paid');
    expect(userPrompt).not.toContain('"role": "tool"');
    expect(userPrompt).not.toContain('tool_calls');
    expect(userPrompt).not.toContain('tool_call_id');
    expect(userPrompt).not.toContain('call_search_orders');
  });

  it('should merge assistant content and tool calls into the same assistant checkpoint item', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(1200);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nassistant content tool summary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_assistant_content_tool_history',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Check customer c_456 before answering.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'I will inspect the latest customer profile before answering.',
        tool_calls: [
          {
            id: 'call_get_customer',
            type: 'function',
            function: {
              name: 'get_customer_profile',
              arguments: '{"customerId":"c_456"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_get_customer',
        content: '{"customer":{"id":"c_456","tier":"enterprise","region":"NA"}}'
      }
    ];

    await compressRequestMessages({
      messages,
      model
    });

    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(userPrompt).toContain('I will inspect the latest customer profile before answering.');
    expect(userPrompt).toContain('<tools>');
    expect(userPrompt).toContain('<tool name=\\"get_customer_profile\\">');
    expect(userPrompt).toContain('<param>{\\"customerId\\":\\"c_456\\"}</param>');
    expect(userPrompt).toContain('enterprise');
    expect(userPrompt).not.toContain('"role": "tool"');
    expect(userPrompt).not.toContain('tool_calls');
    expect(userPrompt).not.toContain('tool_call_id');
    expect(userPrompt).not.toContain('call_get_customer');
  });

  it('should match multiple tool responses by tool call id when tool messages are out of order', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(1200);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nmulti tool summary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_multi_tool_history',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Compare recent orders and contracts for Acme.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'I need both order and contract data.',
        tool_calls: [
          {
            id: 'call_orders_multi',
            type: 'function',
            function: {
              name: 'search_orders',
              arguments: '{"company":"Acme","limit":2}'
            }
          },
          {
            id: 'call_contracts_multi',
            type: 'function',
            function: {
              name: 'search_contracts',
              arguments: '{"company":"Acme","year":2025}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_contracts_multi',
        content: '{"contracts":[{"id":"ctr_multi_1","status":"active"}]}'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_orders_multi',
        content: '{"orders":[{"id":"ord_multi_1","status":"paid"}]}'
      }
    ];

    await compressRequestMessages({
      messages,
      model
    });

    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    const ordersToolIndex = userPrompt.indexOf('<tool name=\\"search_orders\\">');
    const ordersResultIndex = userPrompt.indexOf('ord_multi_1');
    const contractsToolIndex = userPrompt.indexOf('<tool name=\\"search_contracts\\">');
    const contractsResultIndex = userPrompt.indexOf('ctr_multi_1');

    expect(ordersToolIndex).toBeGreaterThan(-1);
    expect(contractsToolIndex).toBeGreaterThan(-1);
    expect(ordersResultIndex).toBeGreaterThan(ordersToolIndex);
    expect(contractsResultIndex).toBeGreaterThan(contractsToolIndex);
    expect(ordersToolIndex).toBeLessThan(contractsToolIndex);
    expect(userPrompt).toContain('<param>{\\"company\\":\\"Acme\\",\\"limit\\":2}</param>');
    expect(userPrompt).toContain('<param>{\\"company\\":\\"Acme\\",\\"year\\":2025}</param>');
    expect(userPrompt).not.toContain('call_orders_multi');
    expect(userPrompt).not.toContain('call_contracts_multi');
    expect(userPrompt).not.toContain('"role": "tool"');
  });

  it('should keep consecutive assistant messages separate while matching each tool response by id', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(1200);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nconsecutive assistant summary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_consecutive_assistant_tools',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Gather order and contract context.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'First I will inspect orders.',
        tool_calls: [
          {
            id: 'call_consecutive_orders',
            type: 'function',
            function: {
              name: 'search_orders',
              arguments: '{"customerId":"c_789"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Then I will inspect contracts.',
        tool_calls: [
          {
            id: 'call_consecutive_contracts',
            type: 'function',
            function: {
              name: 'search_contracts',
              arguments: '{"customerId":"c_789"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_consecutive_contracts',
        content: '{"contracts":[{"id":"ctr_consecutive_1"}]}'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_consecutive_orders',
        content: '{"orders":[{"id":"ord_consecutive_1"}]}'
      }
    ];

    await compressRequestMessages({
      messages,
      model
    });

    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    const firstAssistantIndex = userPrompt.indexOf('First I will inspect orders.');
    const secondAssistantIndex = userPrompt.indexOf('Then I will inspect contracts.');

    expect(firstAssistantIndex).toBeGreaterThan(-1);
    expect(secondAssistantIndex).toBeGreaterThan(firstAssistantIndex);
    expect(userPrompt).toContain('<tool name=\\"search_orders\\">');
    expect(userPrompt).toContain('ord_consecutive_1');
    expect(userPrompt).toContain('<tool name=\\"search_contracts\\">');
    expect(userPrompt).toContain('ctr_consecutive_1');
    expect(userPrompt).not.toContain('call_consecutive_orders');
    expect(userPrompt).not.toContain('call_consecutive_contracts');
    expect(userPrompt).not.toContain('"role": "tool"');
  });

  it('should count tools schema but not send tools schema to checkpoint compression LLM', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(260);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\ntool schema counted summary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_without_tools_schema',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'very long system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content:
          'Available tools: [{"type":"function","function":{"name":"search_orders","parameters":{"properties":{"customerId":{"type":"string"}}}}}]'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: null,
        tool_calls: [
          {
            id: 'call_search_orders',
            type: 'function',
            function: {
              name: 'search_orders',
              arguments: '{"customerId":"c_123"}'
            }
          }
        ]
      }
    ];

    const result = await compressRequestMessages({
      messages,
      model,
      tools: [searchTool]
    });

    expect(createLLMResponseMock).toHaveBeenCalled();
    expect(result.contextCheckpoint).toContain('tool schema counted summary');
    expect(createLLMResponseMock.mock.calls[0][0].body.tools).toBeUndefined();
    expect(countGptMessagesTokensMock).toHaveBeenNthCalledWith(1, {
      messages,
      tools: [searchTool]
    });
    expect(countGptMessagesTokensMock).toHaveBeenNthCalledWith(2, {
      messages: [messages[0], expect.objectContaining({ hideInUI: true })],
      tools: [searchTool]
    });
  });

  it('should not include tool call memory in checkpoint compression prompt', async () => {
    countGptMessagesTokensMock.mockResolvedValueOnce(5000).mockResolvedValueOnce(2000);
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\ntool summary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_tool_memory',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Search enterprise contracts signed by Acme in 2025.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: null,
        tool_calls: [
          {
            id: 'call_search_contracts',
            type: 'function',
            function: {
              name: 'search_contracts',
              arguments: '{"company":"Acme","year":2025}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search_contracts',
        content: '{"contracts":[{"id":"ctr_2025_001","amount":1200000}]}'
      }
    ];

    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toBe(messages[0]);
    expect(result.contextCheckpoint).toBe(
      '<context_checkpoint>\ntool summary\n</context_checkpoint>'
    );
    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(userPrompt).not.toContain('<tool_call_memory>');
    expect(userPrompt).not.toContain('fn=search_contracts');
    expect(userPrompt).not.toContain('args={"company":"Acme","year":2025}');
    expect(userPrompt).toContain('<tool name=\\"search_contracts\\">');
    expect(userPrompt).toContain('<param>{\\"company\\":\\"Acme\\",\\"year\\":2025}</param>');
    expect(userPrompt).toContain('Search enterprise contracts signed by Acme in 2025.');
    expect(userPrompt).toContain('ctr_2025_001');
    expect(userPrompt).not.toContain('"role": "tool"');
    expect(userPrompt).not.toContain('tool_calls');
    expect(userPrompt).not.toContain('tool_call_id');
  });

  it('should use the full request context to decide checkpoint compression', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nshort user summary\n</context_checkpoint>',
      usage: {
        inputTokens: 20,
        outputTokens: 5
      },
      requestId: 'req_full_context_threshold',
      finish_reason: 'stop'
    });
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'very long system prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Developer,
        content: 'very long developer prompt'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'short user history'
      }
    ];
    countGptMessagesTokensMock.mockImplementation(
      async (input: { messages: ChatCompletionMessageParam[] }) =>
        input.messages === messages ? 4000 : 100
    );

    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(countGptMessagesTokensMock).toHaveBeenCalledWith({
      messages
    });
    expect(result.messages).toEqual([
      messages[0],
      messages[1],
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '<context_checkpoint>\nshort user summary\n</context_checkpoint>',
        hideInUI: true
      }
    ]);
    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(userPrompt).toContain('short user history');
    expect(userPrompt).not.toContain('very long system prompt');
    expect(userPrompt).not.toContain('very long developer prompt');
  });

  it('should return original messages and usage when compressor returns empty content', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '',
      usage: {
        inputTokens: 50,
        outputTokens: 0
      },
      requestId: 'req_empty',
      finish_reason: 'stop'
    });

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result.messages).toBe(messages);
    expect(result.contextCheckpoint).toBeUndefined();
    expect(result.requestIds).toEqual(['req_empty']);
    expect(result.usage).toMatchObject({
      moduleName: 'account_usage:compress_llm_messages',
      inputTokens: 50,
      outputTokens: 0
    });
  });

  it('should return original messages with usage when compression is aborted', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10,
        usedUserOpenAIKey: false
      },
      requestId: 'req_abort',
      finish_reason: 'close'
    });

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result.messages).toBe(messages);
    expect(result.contextCheckpoint).toBeUndefined();
    expect(result.requestIds).toEqual(['req_abort']);
    expect(result.usage).toMatchObject({
      totalPoints: 3,
      inputTokens: 50,
      outputTokens: 10
    });
  });

  it('should skip billing points when valid userKey is provided', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10,
        usedUserOpenAIKey: true
      },
      requestId: 'req_user_key',
      finish_reason: 'stop'
    });

    const result = await compressRequestMessages({
      messages: createMessages(),
      model,
      userKey: {
        key: 'user-key',
        baseUrl: 'https://user.example.com/v1'
      }
    });

    expect(result.usage?.totalPoints).toBe(0);
    expect(formatModelChars2PointsMock).not.toHaveBeenCalled();
  });

  it('should not skip billing points when userKey has no key', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: '<context_checkpoint>\nsummary\n</context_checkpoint>',
      usage: {
        inputTokens: 50,
        outputTokens: 10
      },
      requestId: 'req_user_base_url_only',
      finish_reason: 'stop'
    });

    const result = await compressRequestMessages({
      messages: createMessages(),
      model,
      userKey: {
        baseUrl: 'https://user.example.com/v1'
      } as any
    });

    expect(result.usage?.totalPoints).toBe(3);
    expect(formatModelChars2PointsMock).toHaveBeenCalled();
  });

  it('should return original messages when compressor throws', async () => {
    createLLMResponseMock.mockRejectedValue(new Error('network error'));

    const messages = createMessages();
    const result = await compressRequestMessages({
      messages,
      model
    });

    expect(result).toEqual({ messages, messageTokens: 6000 });
  });
});

describe('compressLargeContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultUsagePoints();
    countGptMessagesTokensMock.mockResolvedValue(50);
  });

  it('should return original content when it is already under the compressed token limit', async () => {
    countPromptTokensMock.mockResolvedValue(10);

    const result = await compressLargeContent({
      content: 'short content',
      model,
      compressedTokenLimit: 100
    });

    expect(result).toEqual({ compressed: 'short content' });
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should return rule-cleaned content when urls and base64 cleanup is enough', async () => {
    countPromptTokensMock.mockResolvedValueOnce(1000).mockResolvedValueOnce(10);

    const result = await compressLargeContent({
      content: `visit https://example.com/a/b and payload ${'a'.repeat(120)} done`,
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed).toBe('visit  and payload [BASE64_DATA] done');
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should run all rule cleanups before LLM compression', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(900)
      .mockResolvedValueOnce(10);

    const result = await compressLargeContent({
      content:
        '![diagram](/tmp/image.png)\n\n\nfile /tmp/project/report.txt id 550e8400-e29b-41d4-a716-446655440000 at 2024-01-01T12:30:00Z',
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed).toBe('[diagram]\n\nfile report.txt id at');
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should use LLM chunk compression when rule cleanup is not enough', async () => {
    mockPromptTokensForLlmCompression();
    countGptMessagesTokensMock.mockResolvedValue(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: ' compressed chunk ',
      usage: {
        inputTokens: 20,
        outputTokens: 5,
        usedUserOpenAIKey: false
      },
      requestId: 'req_chunk'
    });

    const result = await compressLargeContent({
      content: 'large content that requires LLM compression',
      model,
      compressedTokenLimit: 100
    });

    expect(result).toMatchObject({
      usage: {
        moduleName: 'account_usage:llm_compress_text',
        model: 'GPT-4',
        totalPoints: 3,
        inputTokens: 20,
        outputTokens: 5
      },
      requestIds: ['req_chunk']
    });
    expect(result.compressed).toBe('compressed chunk');
    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          stream: false
        })
      })
    );
    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('temperature');
    const compressPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[0].content;
    const userPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[1].content;
    expect(compressPrompt).not.toContain('tokens');
    expect(compressPrompt).not.toContain('targetTokens');
    expect(compressPrompt).not.toContain('压缩到约');
    expect(compressPrompt).not.toContain('large content that requires LLM compression');
    expect(userPrompt).toContain('<content>');
    expect(userPrompt).toContain('large content that requires LLM compression');
    expect(userPrompt).toContain('</content>');
    expect(userPrompt).toContain('<output_budget>');
    expect(userPrompt).toContain('Target maximum output tokens: 65');
    expect(createLLMResponseMock.mock.calls[0][0].body.max_tokens).toBeUndefined();
  });

  it('should pass reasoning effort to large content compression requests', async () => {
    mockPromptTokensForLlmCompression();
    countGptMessagesTokensMock.mockResolvedValue(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: 'compressed',
      usage: {
        inputTokens: 20,
        outputTokens: 5,
        usedUserOpenAIKey: true
      },
      requestId: 'req_large_reasoning'
    });

    await compressLargeContent({
      content: 'large content',
      model,
      compressedTokenLimit: 100,
      reasoningEffort: 'low'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body.reasoning_effort).toBe('low');
  });

  it('should keep original chunk text when LLM returns empty chunk content', async () => {
    mockPromptTokensForLlmCompression();
    countGptMessagesTokensMock.mockResolvedValue(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: '',
      usage: {
        inputTokens: 20,
        outputTokens: 0
      },
      requestId: 'req_empty_chunk'
    });

    const content = 'large content that cannot be summarized';
    const result = await compressLargeContent({
      content,
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed).toBe(content);
    expect(result.requestIds).toEqual(['req_empty_chunk']);
  });

  it('should truncate merged LLM output when it still exceeds the compressed token limit', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: 'x'.repeat(1000),
      usage: {
        inputTokens: 20,
        outputTokens: 200
      },
      requestId: 'req_truncate'
    });

    const result = await compressLargeContent({
      content: 'large content',
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed.length).toBeLessThan(1000);
    expect(result.compressed.length).toBeGreaterThan(0);
  });

  it('should keep LLM merge output when tokens are within budget even if char length barely changes', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(999)
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(80);
    createLLMResponseMock
      .mockResolvedValueOnce({
        answerText: 'x'.repeat(1000),
        usage: {
          inputTokens: 20,
          outputTokens: 200
        },
        requestId: 'req_initial_long'
      })
      .mockResolvedValueOnce({
        answerText: 'y'.repeat(980),
        usage: {
          inputTokens: 20,
          outputTokens: 80
        },
        requestId: 'req_merge_within_budget'
      });

    const result = await compressLargeContent({
      content: 'large content',
      model,
      compressedTokenLimit: 100
    });

    expect(result.compressed).toBe('y'.repeat(980));
    expect(result.compressed).not.toContain('content truncated');
  });

  it('should append source excerpts when LLM output uses too little of the budget', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(700)
      .mockResolvedValue(700);
    createLLMResponseMock.mockResolvedValue({
      answerText: '简短摘要',
      usage: {
        inputTokens: 20,
        outputTokens: 20
      },
      requestId: 'req_short_summary'
    });

    const result = await compressLargeContent({
      content: ['开头字段：关键背景', '正文内容。'.repeat(400), '尾部字段：最终结论'].join('\n'),
      model,
      compressedTokenLimit: 1000
    });

    expect(result.compressed).toContain('简短摘要');
    expect(result.compressed).toContain('Source excerpts for exact labels and facts');
    expect(result.compressed).toContain('尾部字段');
  });

  it('should append exact source anchors while staying within the token budget', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(540)
      .mockResolvedValueOnce(580)
      .mockResolvedValueOnce(600);
    createLLMResponseMock.mockResolvedValue({
      answerText: '压缩后的核心事实',
      usage: {
        inputTokens: 20,
        outputTokens: 20
      },
      requestId: 'req_anchor_append'
    });

    const result = await compressLargeContent({
      content: ['问题标题：关键问题', '字段名称：重要字段', '正文内容。'.repeat(400)].join('\n'),
      model,
      compressedTokenLimit: 1000
    });

    expect(result.compressed).toContain('压缩后的核心事实');
    expect(result.compressed).toContain('Source labels / exact anchors');
    expect(result.compressed).toContain('问题标题');
    expect(result.compressed).toContain('字段名称');
  });

  it('should skip source anchors when compressed output already uses most of the budget', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(810)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(810)
      .mockResolvedValueOnce(810);
    createLLMResponseMock.mockResolvedValue({
      answerText: '压缩后的核心事实',
      usage: {
        inputTokens: 20,
        outputTokens: 20
      },
      requestId: 'req_anchor_skip'
    });

    const result = await compressLargeContent({
      content: ['问题标题：关键问题', '字段名称：重要字段', '正文内容。'.repeat(400)].join('\n'),
      model,
      compressedTokenLimit: 1000
    });

    expect(result.compressed).toBe('压缩后的核心事实');
    expect(result.compressed).not.toContain('Source labels / exact anchors');
  });

  it('should append at most twelve source anchors', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(500)
      .mockResolvedValue(520);
    createLLMResponseMock.mockResolvedValue({
      answerText: '压缩后的核心事实',
      usage: {
        inputTokens: 20,
        outputTokens: 20
      },
      requestId: 'req_anchor_cap'
    });

    const result = await compressLargeContent({
      content: [
        ...Array.from({ length: 20 }, (_, index) => `字段${index + 1}：值${index + 1}`),
        '正文内容。'.repeat(400)
      ].join('\n'),
      model,
      compressedTokenLimit: 1000
    });

    const appendedAnchorCount =
      result.compressed
        .split('Source labels / exact anchors:')[1]
        ?.split('\n')
        .filter((line) => line.trim().startsWith('- ')).length ?? 0;

    expect(appendedAnchorCount).toBeLessThanOrEqual(12);
  });

  it('should return cleaned content when LLM chunk compression throws', async () => {
    countPromptTokensMock.mockResolvedValue(1000);
    createLLMResponseMock.mockRejectedValue(new Error('llm unavailable'));

    const result = await compressLargeContent({
      content: 'large   content\n\n\nwith spaces',
      model,
      compressedTokenLimit: 100
    });

    expect(result).toEqual({
      compressed: 'large content\n\nwith spaces'
    });
  });

  it('should skip billing points for chunk compression when valid userKey is provided', async () => {
    mockPromptTokensForLlmCompression();
    countGptMessagesTokensMock.mockResolvedValue(50);
    createLLMResponseMock.mockResolvedValue({
      answerText: 'compressed',
      usage: {
        inputTokens: 20,
        outputTokens: 5,
        usedUserOpenAIKey: true
      },
      requestId: 'req_user_key_chunk'
    });

    const result = await compressLargeContent({
      content: 'large content',
      model,
      compressedTokenLimit: 100,
      userKey: {
        key: 'user-key',
        baseUrl: 'https://user.example.com/v1'
      }
    });

    expect(result.usage?.totalPoints).toBe(0);
    expect(formatModelChars2PointsMock).not.toHaveBeenCalled();
  });
});

describe('extractExactAnchors', () => {
  it('should extract only generic structural anchors instead of ordinary keywords', () => {
    const anchors = extractExactAnchors(
      [
        'The ordinary project background should not become an anchor.',
        'tool_name: search_contracts',
        'trace_id: req_2025_001',
        '问题标题：如何处理长文本压缩',
        '## Release Notes',
        '1.2 处理流程',
        '请参考【结论摘要】继续执行。',
        'Use /tmp/project/report.txt on 2025-01-02.',
        'statusCode: 429'
      ].join('\n'),
      20
    );

    expect(anchors).toEqual(
      expect.arrayContaining([
        'tool_name',
        'trace_id',
        '问题标题',
        'Release Notes',
        '处理流程',
        '结论摘要',
        'req_2025_001',
        '2025-01-02',
        '429'
      ])
    );
    expect(anchors).not.toEqual(expect.arrayContaining(['ordinary', 'project', 'background']));
  });
});

describe('compressToolResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultUsagePoints();
    countGptMessagesTokensMock.mockResolvedValue(50);
  });

  it('should return empty response directly', async () => {
    const result = await compressToolResponse({
      response: '',
      model
    });

    expect(result).toEqual({ compressed: '' });
    expect(countPromptTokensMock).not.toHaveBeenCalled();
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should keep small tool responses unchanged without any processing', async () => {
    countPromptTokensMock.mockResolvedValue(800);
    const response = JSON.stringify(
      {
        rows: [
          {
            id: 'keep_format_001',
            content: 'Small JSON should not be minified or structurally summarized.'
          }
        ]
      },
      null,
      2
    );

    const result = await compressToolResponse({
      response,
      model
    });

    expect(result).toEqual({ compressed: response });
    expect(countPromptTokensMock).toHaveBeenCalledTimes(1);
    expect(createLLMResponseMock).not.toHaveBeenCalled();
  });

  it('should minify JSON tool responses without LLM when minified content fits the budget', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(1200)
      .mockResolvedValueOnce(700)
      .mockResolvedValueOnce(700);
    const response = JSON.stringify(
      {
        source: 'tool_call_log',
        rows: [
          {
            id: 'multiple_001',
            messages: [
              {
                role: 'user',
                content: 'Find lawsuits filed against Google in California in 2020.'
              },
              {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    type: 'function',
                    function: {
                      name: 'lawsuits_search',
                      arguments: '{"company_name":"Google","location":"California","year":2020}'
                    }
                  }
                ]
              }
            ],
            tools: [
              {
                type: 'function',
                function: {
                  name: 'lawsuits_search',
                  description: 'Long description should be removed from compressed tool schema.',
                  parameters: {
                    type: 'object',
                    required: ['company_name', 'location', 'year'],
                    properties: {
                      company_name: {
                        type: 'string',
                        description: 'Company name.'
                      },
                      location: {
                        type: 'string',
                        description: 'Location.'
                      },
                      year: {
                        type: 'integer',
                        description: 'Year.'
                      }
                    }
                  }
                }
              }
            ]
          }
        ]
      },
      null,
      2
    );

    const result = await compressToolResponse({
      response,
      model
    });

    expect(createLLMResponseMock).not.toHaveBeenCalled();
    expect(countPromptTokensMock).toHaveBeenCalledTimes(3);
    const compressed = JSON.parse(result.compressed);
    expect(compressed.source).toBe('tool_call_log');
    expect(result.compressed).toContain('rows');
    expect(result.compressed).toContain('lawsuits_search');
    expect(result.compressed).toContain('company_name');
    expect(result.compressed).toContain('California');
    expect(result.compressed).toContain('Long description');
    expect(result.compressed).not.toContain('\n');
  });

  it('should summarize larger JSON tool responses structurally without LLM', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(1200)
      .mockResolvedValueOnce(900)
      .mockResolvedValueOnce(180)
      .mockResolvedValueOnce(180);
    const response = JSON.stringify({
      source: 'tool_call_log',
      rows: [
        {
          id: 'multiple_001',
          messages: [
            {
              role: 'user',
              content: 'Find lawsuits filed against Google in California in 2020.'
            }
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'lawsuits_search',
                parameters: {
                  type: 'object',
                  required: ['company_name', 'location', 'year']
                }
              }
            }
          ]
        },
        {
          id: 'multiple_002',
          messages: [],
          tools: []
        }
      ]
    });

    const result = await compressToolResponse({
      response,
      model
    });

    expect(createLLMResponseMock).not.toHaveBeenCalled();
    expect(result.compressed).toContain('JSON structural summary');
    expect(result.compressed).toContain('root keys: source, rows');
    expect(result.compressed).not.toContain('importantScalarSummary');
    expect(result.compressed).toContain('"importantScalarValues"');
    expect(result.compressed).toContain('source=tool_call_log');
    expect(result.compressed).toContain('id=multiple_001');
    expect(result.compressed).toContain('rows: array(length=2)');
    expect(result.compressed).toContain('rows[0] keys: id, tools, messages');
    expect(result.compressed).not.toContain('rows[0].id: multiple_001');
    expect(result.compressed).not.toContain('rows[0].tools[0].function.name: lawsuits_search');
    expect(result.compressed).not.toContain('{"source"');
  });

  it('should lightly process medium tool responses without LLM compression', async () => {
    countPromptTokensMock.mockResolvedValueOnce(1200).mockResolvedValueOnce(1000);

    const result = await compressToolResponse({
      response:
        'tool response https://example.com/a/b/c with image ![chart](https://example.com/chart.png)\n\n\nend',
      model,
      reasoningEffort: 'high'
    });

    expect(createLLMResponseMock).not.toHaveBeenCalled();
    expect(result.compressed).not.toContain('https://example.com');
    expect(result.compressed).toContain('tool response');
    expect(result.compressed).toContain('[chart]');
  });

  it('should compress large tool responses with 20 percent context as target', async () => {
    countPromptTokensMock
      .mockResolvedValueOnce(2400)
      .mockResolvedValueOnce(2200)
      .mockResolvedValueOnce(2200)
      .mockResolvedValueOnce(2200)
      .mockResolvedValueOnce(2200)
      .mockResolvedValueOnce(50)
      .mockResolvedValue(2400);
    createLLMResponseMock.mockResolvedValue({
      answerText: 'compressed tool response',
      usage: {
        inputTokens: 30,
        outputTokens: 6
      },
      requestId: 'req_tool'
    });

    const result = await compressToolResponse({
      response: 'tool response',
      model,
      reasoningEffort: 'high'
    });

    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.compressed).toBe('compressed tool response');
    expect(result.usage?.moduleName).toBe('account_usage:tool_response_compress');
    expect(result.requestIds).toEqual(['req_tool']);
    expect(createLLMResponseMock.mock.calls[0][0].body.reasoning_effort).toBe('high');
    expect(createLLMResponseMock.mock.calls[0][0].body.messages[1].content).toContain(
      'Target maximum output tokens: 520'
    );
  });
});
