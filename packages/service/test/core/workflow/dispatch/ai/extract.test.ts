import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { createLLMResponseMock, getLLMModelMock, formatModelChars2PointsMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn(),
  getLLMModelMock: vi.fn(),
  formatModelChars2PointsMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
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

const createAfterSaleProps = () =>
  ({
    ...createProps(),
    params: {
      ...createProps().params,
      content: '客户李四反馈商品包装破损，但没有提供订单号和联系电话。他希望平台尽快处理。',
      description: '从售后反馈中提取客户、订单、商品和问题信息',
      extractKeys: [
        {
          key: 'customerName',
          desc: '客户姓名',
          required: true
        },
        {
          key: 'orderNo',
          desc: '订单号',
          required: true
        },
        {
          key: 'productName',
          desc: '商品名称',
          required: true
        },
        {
          key: 'issue',
          desc: '客户反馈的问题',
          required: true
        }
      ]
    }
  }) as any;

const mockLLMResponse = (answerText: string) => ({
  requestId: 'request_1',
  finish_reason: 'stop',
  answerText,
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    usedUserOpenAIKey: false
  }
});

describe('dispatchContentExtract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    formatModelChars2PointsMock.mockReturnValue({
      totalPoints: 1,
      modelName: 'DeepSeek R1'
    });
  });

  it('uses plain JSON extraction even when the model supports tool choice', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'deepseek-r1',
      name: 'DeepSeek R1',
      maxContext: 128000,
      reasoning: true,
      toolChoice: true
    });
    createLLMResponseMock.mockResolvedValue(mockLLMResponse('{"name":"张三"}'));

    const result = await dispatchContentExtract(createProps());

    expect(createLLMResponseMock.mock.calls[0][0].body).toMatchObject({
      model: 'deepseek-r1',
      stream: true
    });
    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('tools');
    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('tool_choice');
    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('toolCallMode');
    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
    expect(result.data).toMatchObject({
      success: true,
      name: '张三'
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
    createLLMResponseMock.mockResolvedValue(mockLLMResponse('{"name":"张三"}'));

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
    createLLMResponseMock.mockResolvedValue(mockLLMResponse('{"name":"张三"}'));

    await dispatchContentExtract(createProps());

    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
  });

  it('keeps the existing plain JSON slicing behavior', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'gpt-4o',
      name: 'GPT-4o',
      maxContext: 128000,
      reasoning: false,
      toolChoice: false
    });
    createLLMResponseMock.mockResolvedValue(mockLLMResponse('提取结果：{"name":"张三"}'));

    const result = await dispatchContentExtract(createProps());

    expect(result.data).toMatchObject({
      success: true,
      name: '张三'
    });
  });

  it('returns default required fields when the model response has no JSON content', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'gpt-4o',
      name: 'GPT-4o',
      maxContext: 128000,
      reasoning: false,
      toolChoice: false
    });
    createLLMResponseMock.mockResolvedValue(mockLLMResponse('没有可提取的信息'));

    const result = await dispatchContentExtract(createProps());

    expect(result.data).toMatchObject({
      success: true,
      name: ''
    });
  });

  it('ignores scalar JSON responses and keeps the workflow running', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'gpt-4o',
      name: 'GPT-4o',
      maxContext: 128000,
      reasoning: false,
      toolChoice: false
    });
    createLLMResponseMock.mockResolvedValue(mockLLMResponse('1'));

    const result = await dispatchContentExtract(createProps());

    expect(result.data).toMatchObject({
      success: true,
      name: ''
    });
    expect(result.error).toBeUndefined();
  });

  it('extracts multiple fields and removes fields outside the schema', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'gpt-4o',
      name: 'GPT-4o',
      maxContext: 128000,
      reasoning: false,
      toolChoice: false
    });
    createLLMResponseMock.mockResolvedValue(
      mockLLMResponse(
        JSON.stringify({
          customerName: '李四',
          orderNo: '',
          productName: '',
          issue: '商品包装破损，希望平台尽快处理',
          phone: '13800138000'
        })
      )
    );

    const result = await dispatchContentExtract(createAfterSaleProps());

    expect(result.data).toMatchObject({
      success: true,
      customerName: '李四',
      orderNo: '',
      productName: '',
      issue: '商品包装破损，希望平台尽快处理'
    });
    expect(result.data).not.toHaveProperty('phone');
    expect(result.data?.[NodeOutputKeyEnum.contextExtractFields]).toBe(
      JSON.stringify({
        customerName: '李四',
        issue: '商品包装破损，希望平台尽快处理',
        orderNo: '',
        productName: ''
      })
    );
  });
});
