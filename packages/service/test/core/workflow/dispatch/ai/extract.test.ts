import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const {
  createLLMResponseMock,
  filterGPTMessageByMaxContextMock,
  getLLMModelMock,
  formatModelChars2PointsMock
} = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn(),
  filterGPTMessageByMaxContextMock: vi.fn(),
  getLLMModelMock: vi.fn(),
  formatModelChars2PointsMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/llm/utils', () => ({
  filterGPTMessageByMaxContext: filterGPTMessageByMaxContextMock
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: getLLMModelMock
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: formatModelChars2PointsMock
}));

import { dispatchContentExtract } from '@fastgpt/service/core/workflow/dispatch/ai/extract';

const createProps = () =>
  ({
    runningAppInfo: {
      id: 'app_1'
    },
    node: {
      nodeId: 'extract_node',
      name: '内容提取',
      flowNodeType: FlowNodeTypeEnum.contentExtract
    },
    histories: [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            text: {
              content: '历史问题'
            }
          }
        ]
      }
    ],
    externalProvider: {},
    usagePush: vi.fn(),
    params: {
      content: '张三来自杭州',
      history: 6,
      model: 'deepseek-r1',
      description: '提取姓名',
      extractKeys: [
        {
          key: 'name',
          desc: '姓名',
          required: true
        }
      ]
    }
  }) as any;

describe('dispatchContentExtract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filterGPTMessageByMaxContextMock.mockImplementation(async ({ messages }) => messages);
    formatModelChars2PointsMock.mockReturnValue({
      totalPoints: 1,
      modelName: 'DeepSeek R1'
    });
  });

  it('forces reasoning models to disable reasoning in tool choice extraction', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'deepseek-r1',
      name: 'DeepSeek R1',
      maxContext: 128000,
      reasoning: true,
      toolChoice: true
    });
    createLLMResponseMock.mockResolvedValue({
      answerText: '',
      toolCalls: [
        {
          function: {
            arguments: '{"name":"张三"}'
          }
        }
      ],
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        usedUserOpenAIKey: false
      }
    });

    await dispatchContentExtract(createProps());

    expect(createLLMResponseMock.mock.calls[0][0].body).toMatchObject({
      model: 'deepseek-r1',
      reasoning_effort: 'none',
      toolCallMode: 'toolChoice'
    });
  });

  it('does not set reasoning effort in completion extraction', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'deepseek-r1',
      name: 'DeepSeek R1',
      maxContext: 128000,
      reasoning: true,
      toolChoice: false
    });
    createLLMResponseMock.mockResolvedValue({
      answerText: '{"name":"张三"}',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        usedUserOpenAIKey: false
      }
    });

    await dispatchContentExtract(createProps());

    expect(createLLMResponseMock.mock.calls[0][0].body).toMatchObject({
      model: 'deepseek-r1'
    });
    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
  });

  it('does not set reasoning effort for non-reasoning extraction models', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'gpt-4o',
      name: 'GPT-4o',
      maxContext: 128000,
      reasoning: false,
      toolChoice: false
    });
    createLLMResponseMock.mockResolvedValue({
      answerText: '{"name":"张三"}',
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        usedUserOpenAIKey: false
      }
    });

    await dispatchContentExtract(createProps());

    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
  });
});
