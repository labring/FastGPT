import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchChatCompletion } from '@fastgpt/service/core/workflow/dispatch/ai/chat/dispatchChatCompletion';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  NodeInputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { loadRequestMessages } from '@fastgpt/service/core/ai/llm/utils';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
import { serviceEnv } from '@fastgpt/service/env';
import { axios } from '@fastgpt/service/common/api/axios';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { llmCompletionsBodyFormat } from '@fastgpt/service/core/ai/llm/request/requestBody';

const fixture = vi.hoisted(() => ({
  requestMock: vi.fn(),
  runYuanbaoSearchMock: vi.fn(),
  useRealFileFlow: false,
  modelSupportsAudio: false,
  modelSupportsVideo: false,
  modelToolChoice: false
}));
const { requestMock } = fixture;
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({ createLLMResponse: fixture.requestMock }));
vi.mock('@fastgpt/service/core/ai/webSearch/yuanbao', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/webSearch/yuanbao')>()),
  runYuanbaoSearch: fixture.runYuanbaoSearchMock
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getSystemModelHandle: async () => ({
    getModelData: () => ({ modelId: 'model', name: 'model', config: { maxResponse: 4096 } }),
    getLLMModelData: () => ({ modelId: 'model', name: 'model', config: { maxResponse: 4096 } })
  }),
  getTeamModelHandle: async () => ({
    getModelData: () => ({
      modelId: 'model',
      name: 'model',
      config: {
        maxResponse: 4096,
        maxContext: 8192,
        toolChoice: fixture.modelToolChoice,
        audio: fixture.modelSupportsAudio,
        video: fixture.modelSupportsVideo
      }
    }),
    getLLMModelData: () => ({
      modelId: 'model',
      name: 'model',
      config: {
        maxResponse: 4096,
        maxContext: 8192,
        toolChoice: fixture.modelToolChoice,
        audio: fixture.modelSupportsAudio,
        video: fixture.modelSupportsVideo
      }
    })
  })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/chat/chatMessages', async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import('@fastgpt/service/core/workflow/dispatch/ai/chat/chatMessages')
    >();
  return {
    ...mod,
    getChatMessages: async (props: Parameters<typeof mod.getChatMessages>[0]) =>
      fixture.useRealFileFlow ? mod.getChatMessages(props) : []
  };
});
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/chat/datasetCite', () => ({
  getDatasetCiteData: async () => ({ userInput: 'question' })
}));
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/chat/fileContext', async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import('@fastgpt/service/core/workflow/dispatch/ai/chat/fileContext')
    >();
  return {
    ...mod,
    getAIChatFileContextConfig: (props: Parameters<typeof mod.getAIChatFileContextConfig>[0]) =>
      fixture.useRealFileFlow ? mod.getAIChatFileContextConfig(props) : {},
    getInputFiles: (props: Parameters<typeof mod.getInputFiles>[0]) =>
      fixture.useRealFileFlow ? mod.getInputFiles(props) : []
  };
});
vi.mock('@fastgpt/service/core/workflow/utils/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/utils/context')>()),
  getWorkflowFileMaxAmount: () => 20
}));
vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: () => ({ totalPoints: 7 })
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  assertAuthModels: vi.fn(async () => ({ handle: {}, models: [] })),
  getAuthorizedModelIds: vi.fn(async () => new Set())
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn(async () => 1),
  countGptMessagesTokensBatch: vi.fn(async (groups: unknown[]) => groups.map(() => 1))
}));

describe('dispatchChatCompletion token summary', () => {
  it.each(['success', 'empty', 'error'])(
    '保留 %s 返回的模型 usage，计费行为不变',
    async (status) => {
      requestMock.mockResolvedValueOnce({
        completeMessages: [],
        answerText: 'answer',
        finish_reason: 'stop',
        requestId: 'req',
        usage: { inputTokens: 13, outputTokens: 4 },
        ...(status === 'empty' ? { responseEmptyTip: 'empty response' } : {}),
        ...(status === 'error' ? { error: 'LLM failed' } : {})
      });
      const nodeSummary = createNodeSummary();
      const usagePush = vi.fn();
      const result = await dispatchChatCompletion({
        node: { name: 'Chat', inputs: [] },
        histories: [],
        runningUserInfo: { teamId: 'team' },
        runningAppInfo: { teamId: 'team' },
        externalProvider: {},
        params: { userChatInput: 'question' },
        nodeSummary,
        usagePush
      } as any);
      expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
        inputTokens: 13,
        outputTokens: 4
      });
      expect(nodeSummary).toMatchObject({ llmInputTokens: 0, llmOutputTokens: 0 });
      if (status !== 'success') expect(result.rawError).toBeDefined();
      if (status === 'empty') expect(usagePush).not.toHaveBeenCalled();
      else
        expect(usagePush).toHaveBeenCalledWith([
          expect.objectContaining({ inputTokens: 13, outputTokens: 4, totalPoints: 7 })
        ]);
    }
  );

  it('请求抛错且没有 usage 时保持零值', async () => {
    requestMock.mockRejectedValueOnce(new Error('network'));
    const nodeSummary = createNodeSummary();
    const result = await dispatchChatCompletion({
      node: { name: 'Chat', inputs: [] },
      histories: [],
      runningUserInfo: { teamId: 'team' },
      runningAppInfo: { teamId: 'team' },
      externalProvider: {},
      params: { userChatInput: 'question' },
      nodeSummary,
      usagePush: vi.fn()
    } as any);
    expect(result.rawError).toBeDefined();
    expect(nodeSummary).toMatchObject({ llmInputTokens: 0, llmOutputTokens: 0 });
  });
});

describe('dispatchChatCompletion Yuanbao search', () => {
  beforeEach(() => {
    requestMock.mockReset();
    fixture.runYuanbaoSearchMock.mockReset();
    fixture.modelToolChoice = false;
  });

  afterEach(() => {
    requestMock.mockReset();
    fixture.runYuanbaoSearchMock.mockReset();
    fixture.modelToolChoice = false;
  });

  it('keeps enabled native search tools in the actual formatted model request', async () => {
    fixture.modelToolChoice = true;
    requestMock.mockResolvedValueOnce({
      completeMessages: [],
      answerText: 'answer',
      reasoningText: '',
      finish_reason: 'stop',
      requestId: 'req_1',
      usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
    });
    await dispatchChatCompletion({
      node: { name: 'Chat', inputs: [] },
      histories: [],
      runningUserInfo: { teamId: 'team' },
      runningAppInfo: { teamId: 'team' },
      externalProvider: {},
      params: { userChatInput: 'question', enableWebSearch: true },
      nodeSummary: createNodeSummary(),
      usagePush: vi.fn()
    } as any);

    const { requestBody } = await llmCompletionsBodyFormat(requestMock.mock.calls[0][0].body);
    expect(requestBody.tools?.[0]?.function.name).toBe('yuanbao_web_search');
    expect(requestBody.tool_choice).toBe('auto');
  });

  it('executes a model requested search, returns the streamed final answer and sums every request usage', async () => {
    const call = {
      id: 'web_1',
      type: 'function',
      function: { name: 'yuanbao_web_search', arguments: '{"query":"FastGPT news"}' }
    };
    requestMock
      .mockResolvedValueOnce({
        completeMessages: [{ role: 'assistant', tool_calls: [call] }],
        assistantMessage: { role: 'assistant', tool_calls: [call] },
        toolCalls: [call],
        answerText: '',
        reasoningText: '',
        finish_reason: 'tool_calls',
        requestId: 'req_1',
        usage: { inputTokens: 10, outputTokens: 2, usedUserOpenAIKey: false }
      })
      .mockResolvedValueOnce({
        completeMessages: [],
        answerText: 'Source: https://example.com',
        reasoningText: '',
        finish_reason: 'stop',
        requestId: 'req_2',
        usage: { inputTokens: 14, outputTokens: 5, usedUserOpenAIKey: false }
      });
    fixture.runYuanbaoSearchMock.mockResolvedValueOnce({
      query: 'FastGPT news',
      results: [{ title: 'News', url: 'https://example.com', snippet: 'Fresh result' }]
    });
    const workflowStreamResponse = vi.fn();
    const usagePush = vi.fn();

    const result = await dispatchChatCompletion({
      node: { name: 'Chat', inputs: [] },
      histories: [],
      runningUserInfo: { teamId: 'team' },
      runningAppInfo: { teamId: 'team' },
      externalProvider: {},
      params: { userChatInput: 'question', enableWebSearch: true },
      stream: true,
      workflowStreamResponse,
      usagePush,
      nodeSummary: createNodeSummary()
    } as any);

    expect(result.data?.answerText).toBe('Source: https://example.com');
    expect(JSON.stringify(result.data?.history)).toContain('"toolName":"元宝联网搜索"');
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
      inputTokens: 24,
      outputTokens: 7,
      llmRequestIds: ['req_1', 'req_2']
    });
    expect(usagePush).toHaveBeenCalledWith([
      expect.objectContaining({ inputTokens: 24, outputTokens: 7 })
    ]);
    expect(requestMock).toHaveBeenCalledTimes(2);
    expect(requestMock.mock.calls[0][0].body.tools[0].function.name).toBe('yuanbao_web_search');
    expect(requestMock.mock.calls[1][0].body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'web_1',
          content: expect.stringContaining('https://example.com')
        })
      ])
    );
    expect(requestMock.mock.calls[1][0].body.stream).toBe(true);
    expect(fixture.runYuanbaoSearchMock).toHaveBeenCalledTimes(1);
  });

  it('feeds a sanitized search failure to the model and keeps answering', async () => {
    const call = {
      id: 'web_failed',
      type: 'function',
      function: { name: 'yuanbao_web_search', arguments: '{"query":"FastGPT news"}' }
    };
    requestMock
      .mockResolvedValueOnce({
        completeMessages: [{ role: 'assistant', tool_calls: [call] }],
        toolCalls: [call],
        answerText: '',
        reasoningText: '',
        finish_reason: 'tool_calls',
        requestId: 'req_1',
        usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
      })
      .mockResolvedValueOnce({
        completeMessages: [],
        answerText: 'I can still help',
        reasoningText: '',
        finish_reason: 'stop',
        requestId: 'req_2',
        usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
      });
    fixture.runYuanbaoSearchMock.mockRejectedValueOnce(new Error('credential=private-value'));

    const result = await dispatchChatCompletion({
      node: { name: 'Chat', inputs: [] },
      histories: [],
      runningUserInfo: { teamId: 'team' },
      runningAppInfo: { teamId: 'team' },
      externalProvider: {},
      params: { userChatInput: 'question', enableWebSearch: true },
      nodeSummary: createNodeSummary(),
      usagePush: vi.fn()
    } as any);

    expect(result.data?.answerText).toBe('I can still help');
    const toolMessage = requestMock.mock.calls[1][0].body.messages.at(-1);
    expect(toolMessage.content).toContain('Tool error: Yuanbao search unavailable');
    expect(toolMessage.content).not.toContain('private-value');
  });

  it('keeps text streamed before a tool call in the final answer and history', async () => {
    const call = {
      id: 'web_preface',
      type: 'function',
      function: { name: 'yuanbao_web_search', arguments: '{"query":"FastGPT"}' }
    };
    requestMock
      .mockImplementationOnce(async ({ onStreaming }) => {
        onStreaming?.({ text: 'Let me search. ' });
        return {
          completeMessages: [{ role: 'assistant', content: 'Let me search. ', tool_calls: [call] }],
          toolCalls: [call],
          answerText: 'Let me search. ',
          reasoningText: '',
          finish_reason: 'tool_calls',
          requestId: 'req_1',
          usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
        };
      })
      .mockImplementationOnce(async ({ onStreaming }) => {
        onStreaming?.({ text: 'Found a source.' });
        return {
          completeMessages: [],
          answerText: 'Found a source.',
          reasoningText: '',
          finish_reason: 'stop',
          requestId: 'req_2',
          usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
        };
      });
    fixture.runYuanbaoSearchMock.mockResolvedValueOnce({ query: 'FastGPT', results: [] });
    const workflowStreamResponse = vi.fn();

    const result = await dispatchChatCompletion({
      node: { name: 'Chat', inputs: [] },
      histories: [],
      runningUserInfo: { teamId: 'team' },
      runningAppInfo: { teamId: 'team' },
      externalProvider: {},
      params: { userChatInput: 'question', enableWebSearch: true },
      stream: true,
      workflowStreamResponse,
      nodeSummary: createNodeSummary(),
      usagePush: vi.fn()
    } as any);

    expect(result.data?.answerText).toBe('Let me search. Found a source.');
    expect(JSON.stringify(result.data?.history)).toContain('Let me search.');
    expect(JSON.stringify(result.data?.history)).toContain('Found a source.');
    expect(workflowStreamResponse).toHaveBeenCalledTimes(2);
  });

  it('limits search to three calls and forces a final answer request', async () => {
    let requestIndex = 0;
    requestMock.mockImplementation(async () => {
      requestIndex++;
      const call = {
        id: `web_${requestIndex}`,
        type: 'function',
        function: { name: 'yuanbao_web_search', arguments: '{"query":"FastGPT"}' }
      };
      return requestIndex <= 3
        ? {
            completeMessages: [{ role: 'assistant', tool_calls: [call] }],
            toolCalls: [call],
            answerText: '',
            reasoningText: '',
            finish_reason: 'tool_calls',
            requestId: `req_${requestIndex}`,
            usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
          }
        : {
            completeMessages: [],
            answerText: 'Final answer',
            reasoningText: '',
            finish_reason: 'stop',
            requestId: 'req_4',
            usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
          };
    });
    fixture.runYuanbaoSearchMock.mockResolvedValue({ query: 'FastGPT', results: [] });

    const result = await dispatchChatCompletion({
      node: { name: 'Chat', inputs: [] },
      histories: [],
      runningUserInfo: { teamId: 'team' },
      runningAppInfo: { teamId: 'team' },
      externalProvider: {},
      params: { userChatInput: 'question', enableWebSearch: true },
      nodeSummary: createNodeSummary(),
      usagePush: vi.fn()
    } as any);

    expect(result.data?.answerText).toBe('Final answer');
    expect(requestMock).toHaveBeenCalledTimes(4);
    expect(fixture.runYuanbaoSearchMock).toHaveBeenCalledTimes(3);
    expect(requestMock.mock.calls[3][0].body.tool_choice).toBe('none');
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
      inputTokens: 4,
      outputTokens: 4,
      llmRequestIds: ['req_1', 'req_2', 'req_3', 'req_4']
    });
  });

  it('keeps all paid usage and request IDs when the final model response is empty', async () => {
    const call = {
      id: 'web_empty',
      type: 'function',
      function: { name: 'yuanbao_web_search', arguments: '{"query":"FastGPT"}' }
    };
    requestMock
      .mockResolvedValueOnce({
        completeMessages: [{ role: 'assistant', tool_calls: [call] }],
        toolCalls: [call],
        answerText: '',
        reasoningText: '',
        finish_reason: 'tool_calls',
        requestId: 'req_paid_1',
        usage: { inputTokens: 10, outputTokens: 2, usedUserOpenAIKey: false }
      })
      .mockResolvedValueOnce({
        completeMessages: [],
        answerText: '',
        reasoningText: '',
        responseEmptyTip: 'empty response',
        finish_reason: 'stop',
        requestId: 'req_paid_2',
        usage: { inputTokens: 14, outputTokens: 5, usedUserOpenAIKey: false }
      });
    fixture.runYuanbaoSearchMock.mockResolvedValueOnce({ query: 'FastGPT', results: [] });
    const usagePush = vi.fn();

    const result = await dispatchChatCompletion({
      node: { name: 'Chat', inputs: [] },
      histories: [],
      runningUserInfo: { teamId: 'team' },
      runningAppInfo: { teamId: 'team' },
      externalProvider: {},
      params: { userChatInput: 'question', enableWebSearch: true },
      nodeSummary: createNodeSummary(),
      usagePush
    } as any);

    expect(result.rawError).toBeDefined();
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toMatchObject({
      inputTokens: 24,
      outputTokens: 7,
      llmRequestIds: ['req_paid_1', 'req_paid_2']
    });
    expect(usagePush).toHaveBeenCalledWith([
      expect.objectContaining({ inputTokens: 24, outputTokens: 7 })
    ]);
  });

  it.each([false, 'false', 1, undefined])(
    'does not expose search tools for non-true enableWebSearch=%s',
    async (enableWebSearch) => {
      requestMock.mockResolvedValueOnce({
        completeMessages: [],
        answerText: 'normal answer',
        reasoningText: '',
        finish_reason: 'stop',
        requestId: 'req_1',
        usage: { inputTokens: 1, outputTokens: 1, usedUserOpenAIKey: false }
      });
      await dispatchChatCompletion({
        node: { name: 'Chat', inputs: [] },
        histories: [],
        runningUserInfo: { teamId: 'team' },
        runningAppInfo: { teamId: 'team' },
        externalProvider: {},
        params: { userChatInput: 'question', enableWebSearch },
        nodeSummary: createNodeSummary(),
        usagePush: vi.fn()
      } as any);
      expect(requestMock.mock.calls[0][0].body.tools).toBeUndefined();
      expect(fixture.runYuanbaoSearchMock).not.toHaveBeenCalled();
    }
  );
});

describe('dispatchChatCompletion media file inputs', () => {
  const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;
  const multimediaEnv: { MULTIPLE_DATA_TO_BASE64: boolean } = serviceEnv;

  afterEach(() => {
    fixture.useRealFileFlow = false;
    fixture.modelSupportsAudio = false;
    fixture.modelSupportsVideo = false;
    multimediaEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
    vi.restoreAllMocks();
  });

  it.each(
    (
      [
        [true, true, false],
        [true, true, true],
        [false, true, false],
        [false, true, true],
        [true, false, false],
        [true, false, true]
      ] as const
    ).flatMap(([nodeMedia, modelMedia, uploadMedia]) =>
      (['audio', 'video'] as const).map(
        (media) => [media, nodeMedia, modelMedia, uploadMedia] as const
      )
    )
  )(
    '%s：节点=%s、模型=%s、上传=%s；附件只受节点和模型能力控制',
    async (media, nodeMedia, modelMedia, uploadMedia) => {
      const url =
        media === 'audio'
          ? 'https://samplelib.com/mp3/sample-3s.mp3'
          : 'https://files.example.com/download?token=video';
      fixture.useRealFileFlow = true;
      fixture.modelSupportsAudio = media === 'audio' && modelMedia;
      fixture.modelSupportsVideo = media === 'video' && modelMedia;
      multimediaEnv.MULTIPLE_DATA_TO_BASE64 = false;
      const head = vi.spyOn(axios, 'head').mockResolvedValue({
        headers: { 'content-type': 'video/mp4' }
      });
      const get = vi.spyOn(axios, 'get');
      let requestMessages: ChatCompletionMessageParam[] = [];
      requestMock.mockClear().mockImplementation(async ({ body }) => {
        requestMessages = await loadRequestMessages({
          messages: body.messages,
          useAudio: body.useAudio,
          useVideo: body.useVideo
        });
        return {
          completeMessages: requestMessages,
          answerText: 'answer',
          finish_reason: 'stop',
          requestId: 'req',
          usage: { inputTokens: 1, outputTokens: 1 }
        };
      });

      const { fileContext, fileRegistrar } = await prepareWorkflowFileContext({
        query: [],
        histories: [],
        scope: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app-1',
          uid: 'user-1',
          chatId: 'chat-1'
        },
        maxFileAmount: 5
      });
      const variableState = await WorkflowVariableState.create({
        timezone: 'Asia/Shanghai',
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app-1',
          name: 'App',
          teamId: 'team',
          tmbId: 'member'
        },
        uid: 'user-1',
        chatId: 'chat-1',
        maxFileAmount: 5,
        variablesConfig: [
          {
            key: 'file',
            label: '文件',
            description: '',
            type: VariableInputEnum.file,
            valueType: WorkflowIOValueTypeEnum.arrayString
          }
        ],
        inputVariables: { file: [{ url, type: ChatFileTypeEnum.file }] },
        resolveInputFile: async (file) =>
          (await fileRegistrar.registerInputFile({ file, source: 'variable' }))?.modelUrl
      });
      expect(variableState.get('file')).toEqual([url]);
      const result = await runWithContext({ mcpClientMemory: {}, fileContext }, () =>
        dispatchChatCompletion({
          node: {
            name: 'Chat',
            inputs: [{ key: NodeInputKeyEnum.fileUrlList, value: ['global', 'file'] }]
          },
          histories: [],
          runningUserInfo: { teamId: 'team', tmbId: 'member' },
          runningAppInfo: { teamId: 'team' },
          externalProvider: {},
          chatConfig: {
            fileSelectConfig: {
              canSelectAudio: uploadMedia,
              canSelectVideo: uploadMedia,
              maxFiles: 0
            }
          },
          params: {
            model: 'gemini-3.8-flash',
            userChatInput: '识别一下文件内容',
            fileUrlList: variableState.get('file'),
            aiChatAudio: media === 'audio' && nodeMedia,
            aiChatVideo: media === 'video' && nodeMedia
          },
          nodeSummary: createNodeSummary(),
          usagePush: vi.fn()
        } as any)
      );

      expect(result.error).toBeUndefined();
      expect(requestMock).toHaveBeenCalledTimes(1);
      expect(requestMessages[0].content).toEqual(
        nodeMedia && modelMedia
          ? [
              media === 'audio'
                ? { type: 'input_audio', input_audio: { data: url, format: 'mp3' } }
                : { type: 'video_url', video_url: { url } },
              { type: 'text', text: 'question' }
            ]
          : 'question'
      );
      expect(head).toHaveBeenCalledTimes(media === 'video' ? 1 : 0);
      expect(get).not.toHaveBeenCalled();
    }
  );
});
