import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchChatCompletion } from '@fastgpt/service/core/workflow/dispatch/ai/chat/dispatchChatCompletion';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { getMaxHistoryLimitFromNodes } from '@fastgpt/global/core/workflow/runtime/utils';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
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

const fixture = vi.hoisted(() => ({
  requestMock: vi.fn(),
  useRealFileFlow: false,
  useRealDatasetCite: false,
  modelSupportsAudio: false,
  modelSupportsVideo: false,
  maxContext: 8192
}));
const { requestMock } = fixture;
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({ createLLMResponse: fixture.requestMock }));
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
        maxContext: fixture.maxContext,
        audio: fixture.modelSupportsAudio,
        video: fixture.modelSupportsVideo
      }
    }),
    getLLMModelData: () => ({
      modelId: 'model',
      name: 'model',
      config: {
        maxResponse: 4096,
        maxContext: fixture.maxContext,
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
vi.mock('@fastgpt/service/core/workflow/dispatch/ai/chat/datasetCite', async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import('@fastgpt/service/core/workflow/dispatch/ai/chat/datasetCite')
    >();
  return {
    ...mod,
    getDatasetCiteData: (props: Parameters<typeof mod.getDatasetCiteData>[0]) =>
      fixture.useRealDatasetCite ? mod.getDatasetCiteData(props) : { userInput: 'question' }
  };
});
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

// 真实 Mongo 读写模拟多次独立请求，验证加载上限和落库 memory 共同维持窗口。
describe('periodic chat history across persisted rounds', () => {
  afterEach(() => {
    fixture.useRealFileFlow = false;
    fixture.useRealDatasetCite = false;
    fixture.maxContext = 8192;
    requestMock.mockReset();
  });

  it('周期窗口仍受最终 token 上限约束，模型失败时不推进窗口状态', async () => {
    fixture.useRealFileFlow = true;
    fixture.useRealDatasetCite = true;
    fixture.maxContext = 3;
    const histories = Array.from({ length: 4 }, (_, index) => [
      { dataId: `r${index}`, obj: ChatRoleEnum.Human, value: [{ text: { content: `q${index}` } }] },
      { dataId: `r${index}`, obj: ChatRoleEnum.AI, value: [{ text: { content: `a${index}` } }] }
    ]).flat();
    const props = {
      node: { ...AiChatModule, nodeId: 'chat' },
      histories,
      responseChatItemId: 'current',
      runningAppInfo: { sourceType: ChatSourceTypeEnum.app, sourceId: 'source', teamId: 'team' },
      runningUserInfo: { teamId: 'team', tmbId: 'member' },
      externalProvider: {},
      checkIsStopping: () => false,
      params: {
        history: 6,
        aiChatHistoryWindow: { min: 2, max: 4 },
        systemPrompt: 'system',
        userChatInput: 'current',
        maxToken: 1
      },
      usagePush: vi.fn(),
      nodeSummary: createNodeSummary()
    };
    for (const error of [undefined, 'model failed']) {
      let sent: ChatCompletionMessageParam[] = [];
      requestMock.mockImplementationOnce(async ({ body }) => {
        sent = await loadRequestMessages({ messages: body.messages });
        return {
          completeMessages: sent,
          answerText: 'answer',
          finish_reason: 'stop',
          requestId: 'req',
          usage: { inputTokens: 1, outputTokens: 1 },
          error
        };
      });
      const result = await dispatchChatCompletion(props as any);
      expect(sent.map((message) => message.content)).toEqual(['system', 'current']);
      if (error) expect(result[DispatchNodeResponseKeyEnum.memories]).toBeUndefined();
      else expect(result[DispatchNodeResponseKeyEnum.memories]).toBeDefined();
    }
  });

  it.each([false, true])(
    '保持增长期的实际请求前缀，并跨越加载上限重置窗口（stream=%s）',
    async (stream) => {
      fixture.useRealFileFlow = true;
      fixture.useRealDatasetCite = true;
      const sourceId = '67e0d5535c02d1d5cdede71f';
      const teamId = '654a4107c32f3bf5f998452f';
      const tmbId = '65ab7007462ada7dbb899948';
      const node = {
        ...AiChatModule,
        nodeId: 'chat',
        inputs: [
          ...AiChatModule.inputs.filter((input) => input.key !== 'aiChatHistoryWindow'),
          {
            key: 'aiChatHistoryWindow',
            value: { min: 6, max: 12 },
            label: '',
            renderTypeList: [],
            valueType: WorkflowIOValueTypeEnum.object
          }
        ]
      };
      let previousRequest: ChatCompletionMessageParam[] = [];
      for (let round = 0; round < 30; round++) {
        const { histories } = await getChatItems({
          sourceType: ChatSourceTypeEnum.app,
          sourceId,
          chatId: 'periodic',
          offset: 0,
          limit: getMaxHistoryLimitFromNodes([node as any]),
          field: 'obj value memories'
        });
        let sent: ChatCompletionMessageParam[] = [];
        requestMock.mockImplementationOnce(async ({ body }) => {
          sent = await loadRequestMessages({ messages: body.messages });
          return {
            completeMessages: [...sent, { role: 'assistant', content: `answer-${round}` }],
            answerText: `answer-${round}`,
            finish_reason: 'stop',
            requestId: `req-${round}`,
            usage: { inputTokens: 1, outputTokens: 1 }
          };
        });
        const result = await dispatchChatCompletion({
          node,
          histories,
          stream,
          responseChatItemId: `round-${round}`,
          runningAppInfo: { sourceType: ChatSourceTypeEnum.app, sourceId, teamId },
          runningUserInfo: { teamId, tmbId },
          externalProvider: {},
          checkIsStopping: () => false,
          params: {
            userChatInput: `question-${round}`,
            systemPrompt: 'Stable system',
            history: 6,
            aiChatHistoryWindow: { min: 6, max: 12 },
            maxToken: 1
          },
          usagePush: vi.fn(),
          nodeSummary: createNodeSummary()
        } as any);
        expect(result.error).toBeUndefined();
        const kept = round <= 12 ? round : 6 + ((round - 6) % 7);
        const first = round - kept;
        expect(
          sent.filter((message) => message.role === 'user').map((message) => message.content)
        ).toEqual(Array.from({ length: kept + 1 }, (_, index) => `question-${first + index}`));
        // 增长阶段保留上一请求的完整消息前缀；缩窗发生时允许前缀改变。
        if (round > 0 && kept !== 6) {
          expect(sent.slice(0, previousRequest.length)).toEqual(previousRequest);
        }
        previousRequest = sent;
        await MongoChatItem.create([
          {
            appId: sourceId,
            sourceType: ChatSourceTypeEnum.app,
            teamId,
            tmbId,
            chatId: 'periodic',
            dataId: `round-${round}`,
            obj: ChatRoleEnum.Human,
            value: [{ text: { content: `question-${round}` } }]
          },
          {
            appId: sourceId,
            sourceType: ChatSourceTypeEnum.app,
            teamId,
            tmbId,
            chatId: 'periodic',
            dataId: `round-${round}`,
            obj: ChatRoleEnum.AI,
            value: [{ text: { content: `answer-${round}` } }],
            memories: result[DispatchNodeResponseKeyEnum.memories]
          }
        ]);
      }
    }
  );
});
