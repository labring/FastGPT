import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDataType, LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  InvokeChatCompletionsBodySchema,
  type InvokeChatCompletionsBodyType
} from '@fastgpt/global/openapi/plugin/invoke';
import { openAPIDocument } from '@fastgpt/global/openapi/provider/devapi';
import { PluginPermissionEnum } from '@fastgpt/global/sdk/fastgpt-plugin';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { createModelHandle } from '@fastgpt/service/core/ai/model/catalog/handle';
import { InvokeProcessor } from '@fastgpt/service/support/invoke/invoke';
import { countGptMessagesTokensInWorker } from '@fastgpt/service/worker/countGptMessagesTokens/count';

vi.unmock('@fastgpt/service/common/response');

const mocks = vi.hoisted(() => ({
  getTeamModelHandle: vi.fn(),
  assertAuthModels: vi.fn(),
  checkTeamAIPoints: vi.fn(),
  createChatCompletion: vi.fn(),
  countGptMessagesTokens: vi.fn(),
  pushChatItemUsage: vi.fn(),
  createUsage: vi.fn(),
  getSystemToolDisplayInfo: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: mocks.getTeamModelHandle
}));

vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  assertAuthModels: mocks.assertAuthModels
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: mocks.checkTeamAIPoints
}));

vi.mock('@fastgpt/service/core/ai/llm/request/createChatCompletion', () => ({
  createChatCompletion: mocks.createChatCompletion
}));

vi.mock('@fastgpt/service/common/string/tiktoken', () => ({
  countGptMessagesTokens: mocks.countGptMessagesTokens
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  pushChatItemUsage: mocks.pushChatItemUsage,
  createUsage: mocks.createUsage
}));

vi.mock('@fastgpt/service/core/app/tool/systemTool/systemTool.repo', () => ({
  SystemToolRepo: {
    getInstance: () => ({
      getSystemToolDisplayInfo: mocks.getSystemToolDisplayInfo
    })
  }
}));

import completionsRoute from '@/pages/api/invoke/llm/chat/completions';

const ACTIVE_SYSTEM_LLM_ID = '68ad85a7463006c963799a01';
const DEFAULT_FALLBACK_LLM_ID = '68ad85a7463006c963799a02';
const DISABLED_SYSTEM_LLM_ID = '68ad85a7463006c963799a03';
const EMBEDDING_MODEL_ID = '68ad85a7463006c963799a04';
const TEAM_1_LLM_ID = '68ad85a7463006c963799a05';
const TEAM_2_LLM_ID = '68ad85a7463006c963799a06';

const createLLMModelFixture = (
  overrides: Partial<LLMModelDataType> & { modelId: string; model: string }
): LLMModelDataType =>
  ({
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    name: overrides.name ?? overrides.model,
    isActive: true,
    scope: ModelScopeEnum.system,
    charsPointsPrice: 1,
    inputPrice: 1,
    outputPrice: 2,
    pricing: {
      tiers: [
        {
          inputPrice: 1000,
          outputPrice: 2000
        }
      ]
    },
    ...overrides,
    config: {
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 60000,
      maxTemperature: 2,
      showTopP: true,
      showStopSign: true,
      responseFormatList: ['text', 'json_object', 'json_schema'],
      reasoning: true,
      reasoningEffort: true,
      toolChoice: true,
      functionCall: true,
      vision: true,
      ...overrides.config
    }
  }) as LLMModelDataType;

const buildCatalogHandleForTeam1 = () => {
  const activeSystemLLM = createLLMModelFixture({
    modelId: ACTIVE_SYSTEM_LLM_ID,
    model: 'gpt-4o-2024-11-20',
    name: 'GPT-4o System'
  });
  const defaultSystemLLM = createLLMModelFixture({
    modelId: DEFAULT_FALLBACK_LLM_ID,
    model: 'gpt-4o-mini-default',
    name: 'Default Fallback LLM'
  });
  const disabledSystemLLM = createLLMModelFixture({
    modelId: DISABLED_SYSTEM_LLM_ID,
    model: 'gpt-4-disabled',
    name: 'Disabled GPT-4',
    isActive: false
  });
  const embeddingModel: AIModelDataType = {
    type: ModelTypeEnum.embedding,
    modelId: EMBEDDING_MODEL_ID,
    provider: 'OpenAI',
    model: 'text-embedding-3-small',
    name: 'Embedding Small',
    isActive: true,
    scope: ModelScopeEnum.system,
    config: {
      defaultToken: 512,
      maxToken: 8192
    }
  } as AIModelDataType;
  const team1OwnedLLM = createLLMModelFixture({
    modelId: TEAM_1_LLM_ID,
    model: 'deepseek-r1-private',
    name: 'Team 1 Private R1',
    scope: ModelScopeEnum.team,
    teamId: 'team-1',
    tmbId: 'member-1'
  });

  // 注意：team-1 的目录快照只包含系统模型与 team-1 团队模型，不包含 team-2 的模型；
  // 同时显式配置默认模型，用于验证接口在非法/禁用模型时绝不回退默认模型。
  return createModelHandle({
    models: [activeSystemLLM, defaultSystemLLM, disabledSystemLLM, embeddingModel, team1OwnedLLM],
    configuredDefaultModelIds: {
      llm: DEFAULT_FALLBACK_LLM_ID
    },
    revision: 1,
    version: 'v1'
  });
};

const createInvokeToken = ({
  teamId = 'team-1',
  permissions = [PluginPermissionEnum['model:invoke']],
  usageId = '67f000000000000000000099',
  toolId = 'systemTool-webSearch'
}: {
  teamId?: string;
  permissions?: InvokeProcessor['session']['permissions'];
  usageId?: string;
  toolId?: string;
} = {}) =>
  new InvokeProcessor({
    appId: 'app-1',
    chatId: 'chat-1',
    uId: 'user-1',
    teamId,
    tmbId: 'member-1',
    permissions,
    usageId,
    toolId
  }).generateToken();

const createMockHttpContext = ({
  method = 'POST',
  authorization,
  body
}: {
  method?: string;
  authorization?: string;
  body?: unknown;
}) => {
  const reqEmitter = new EventEmitter();
  const resEmitter = new EventEmitter();
  const headers = new Map<string, string | number | readonly string[]>();
  const writtenChunks: string[] = [];
  let jsonPayload: unknown = undefined;

  const req = Object.assign(reqEmitter, {
    method,
    url: '/api/invoke/llm/chat/completions',
    headers: {
      ...(authorization !== undefined ? { authorization } : {})
    },
    socket: Object.assign(new EventEmitter(), { remoteAddress: '127.0.0.1' }),
    body,
    query: {},
    aborted: false,
    complete: true
  });

  const res = Object.assign(resEmitter, {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    writableFinished: false,
    destroyed: false,
    setHeader: vi.fn((key: string, value: string | number | readonly string[]) => {
      headers.set(key.toLowerCase(), value);
      return res;
    }),
    getHeader: vi.fn((key: string) => headers.get(key.toLowerCase())),
    flushHeaders: vi.fn(() => {
      res.headersSent = true;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
      jsonPayload = payload;
      res.headersSent = true;
      res.writableEnded = true;
      res.writableFinished = true;
      resEmitter.emit('finish');
      return res;
    }),
    write: vi.fn((chunk: string | Buffer) => {
      res.headersSent = true;
      writtenChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return true;
    }),
    end: vi.fn((chunk?: string | Buffer) => {
      if (chunk !== undefined) {
        writtenChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      }
      res.headersSent = true;
      res.writableEnded = true;
      res.writableFinished = true;
      resEmitter.emit('finish');
      return res;
    }),
    destroy: vi.fn(() => {
      res.destroyed = true;
      resEmitter.emit('close');
      return res;
    })
  });

  return {
    req,
    res,
    headers,
    writtenChunks,
    getJsonPayload: () => jsonPayload
  };
};

describe('POST /api/invoke/llm/chat/completions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeamModelHandle.mockResolvedValue(buildCatalogHandleForTeam1());
    mocks.assertAuthModels.mockResolvedValue({ handle: buildCatalogHandleForTeam1(), models: [] });
    mocks.checkTeamAIPoints.mockResolvedValue(undefined);
    mocks.countGptMessagesTokens.mockImplementation(async (params) =>
      countGptMessagesTokensInWorker(params)
    );
    mocks.getSystemToolDisplayInfo.mockResolvedValue({
      id: 'systemTool-webSearch',
      name: {
        'zh-CN': '联网搜索工具',
        en: 'Web Search Tool'
      }
    });
  });

  describe('OpenAPI contract & schema validation', () => {
    it('registers /invoke/llm/chat/completions in OpenAPI document and validates standard OpenAI fields', () => {
      expect(openAPIDocument.paths['/invoke/llm/chat/completions']?.post).toBeDefined();

      const parsed = InvokeChatCompletionsBodySchema.safeParse({
        model: ACTIVE_SYSTEM_LLM_ID,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Summarize this document.' }
        ],
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.7,
        top_p: 0.9,
        max_tokens: 512,
        stop: ['END', '\n\n'],
        seed: 42,
        presence_penalty: 0.1,
        frequency_penalty: 0.2,
        reasoning_effort: 'medium',
        tools: [
          {
            type: 'function',
            function: {
              name: 'lookup_fact',
              description: 'Lookup fact',
              parameters: { type: 'object', properties: { q: { type: 'string' } } }
            }
          }
        ],
        tool_choice: 'auto',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'summary',
            schema: { type: 'object', properties: { title: { type: 'string' } } },
            strict: true
          }
        }
      });

      expect(parsed.success).toBe(true);
      expect(
        InvokeChatCompletionsBodySchema.safeParse({
          model: '   ',
          messages: [{ role: 'user', content: 'hi' }]
        }).success
      ).toBe(false);
      expect(
        InvokeChatCompletionsBodySchema.safeParse({ model: ACTIVE_SYSTEM_LLM_ID, messages: [] })
          .success
      ).toBe(false);
    });
  });

  describe('Authentication & permission enforcement', () => {
    it('returns 401 when Authorization Bearer token is missing or invalid', async () => {
      const missingCtx = createMockHttpContext({
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'hello' }]
        }
      });
      await completionsRoute(missingCtx.req as any, missingCtx.res as any);

      expect(missingCtx.res.statusCode).toBe(401);
      expect(missingCtx.getJsonPayload()).toMatchObject({
        error: {
          type: 'authentication_error',
          code: 'invalid_api_key'
        }
      });

      const invalidCtx = createMockHttpContext({
        authorization: 'Bearer not-a-valid-jwt',
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'hello' }]
        }
      });
      await completionsRoute(invalidCtx.req as any, invalidCtx.res as any);

      expect(invalidCtx.res.statusCode).toBe(401);
      expect(invalidCtx.getJsonPayload()).toMatchObject({
        error: {
          type: 'authentication_error',
          code: 'invalid_api_key'
        }
      });
      expect(mocks.getTeamModelHandle).not.toHaveBeenCalled();
      expect(mocks.createChatCompletion).not.toHaveBeenCalled();
    });

    it('returns 403 when invokeToken lacks model:invoke permission', async () => {
      const tokenWithoutModelInvoke = createInvokeToken({
        permissions: [PluginPermissionEnum['file-upload:allow']]
      });
      const ctx = createMockHttpContext({
        authorization: `Bearer ${tokenWithoutModelInvoke}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'hello' }]
        }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(403);
      expect(ctx.getJsonPayload()).toMatchObject({
        error: {
          message: 'Missing model:invoke permission',
          type: 'permission_error',
          code: 'insufficient_permissions'
        }
      });
      expect(mocks.getTeamModelHandle).not.toHaveBeenCalled();
      expect(mocks.createChatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('Team model validation (never falls back to default model)', () => {
    it('returns 400 when modelId does not exist or is passed as raw upstream model name', async () => {
      const token = createInvokeToken();

      // 即使目录中存在 gpt-4o-2024-11-20 及默认模型，传入未知 ID 或原始模型名也必须被拒绝。
      for (const invalidModelRef of ['non-existent-model-id', 'gpt-4o-2024-11-20']) {
        const ctx = createMockHttpContext({
          authorization: `Bearer ${token}`,
          body: {
            model: invalidModelRef,
            messages: [{ role: 'user', content: 'hello' }]
          }
        });

        await completionsRoute(ctx.req as any, ctx.res as any);

        expect(ctx.res.statusCode).toBe(400);
        expect(ctx.getJsonPayload()).toMatchObject({
          error: {
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

      expect(mocks.getTeamModelHandle).toHaveBeenCalledWith({ teamId: 'team-1' });
      expect(mocks.createChatCompletion).not.toHaveBeenCalled();
    });

    it('returns 400 when modelId is disabled or not an LLM model', async () => {
      const token = createInvokeToken();

      for (const rejectedModelId of [DISABLED_SYSTEM_LLM_ID, EMBEDDING_MODEL_ID]) {
        const ctx = createMockHttpContext({
          authorization: `Bearer ${token}`,
          body: {
            model: rejectedModelId,
            messages: [{ role: 'user', content: 'hello' }]
          }
        });

        await completionsRoute(ctx.req as any, ctx.res as any);

        expect(ctx.res.statusCode).toBe(400);
        expect(ctx.getJsonPayload()).toMatchObject({
          error: {
            type: 'invalid_request_error',
            code: 'model_not_found'
          }
        });
      }

      expect(mocks.createChatCompletion).not.toHaveBeenCalled();
    });

    it('rejects cross-team or unauthorized modelId with 400/403 and never calls upstream', async () => {
      const token = createInvokeToken({ teamId: 'team-1' });

      // 场景 A：team-2 的私有模型不在 team-1 目录快照中 -> 400 阻断
      const missingFromTeamCtx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: TEAM_2_LLM_ID,
          messages: [{ role: 'user', content: 'hello' }]
        }
      });
      await completionsRoute(missingFromTeamCtx.req as any, missingFromTeamCtx.res as any);
      expect(missingFromTeamCtx.res.statusCode).toBe(400);

      // 场景 B：模型句柄显式抛出 unAuthModel 或返回跨团队模型 -> 403 阻断
      mocks.getTeamModelHandle.mockResolvedValueOnce({
        getModelData: () => {
          throw new UserError(ModelErrEnum.unAuthModel);
        }
      });
      const unAuthCtx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: TEAM_2_LLM_ID,
          messages: [{ role: 'user', content: 'hello' }]
        }
      });
      await completionsRoute(unAuthCtx.req as any, unAuthCtx.res as any);
      expect(unAuthCtx.res.statusCode).toBe(403);
      expect(unAuthCtx.getJsonPayload()).toMatchObject({
        error: {
          type: 'permission_error',
          code: 'model_access_denied'
        }
      });

      mocks.getTeamModelHandle.mockResolvedValueOnce({
        getModelData: () =>
          createLLMModelFixture({
            modelId: TEAM_2_LLM_ID,
            model: 'team-2-secret-model',
            scope: ModelScopeEnum.team,
            teamId: 'team-2',
            tmbId: 'member-2'
          })
      });
      const crossTeamCtx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: TEAM_2_LLM_ID,
          messages: [{ role: 'user', content: 'hello' }]
        }
      });
      await completionsRoute(crossTeamCtx.req as any, crossTeamCtx.res as any);
      expect(crossTeamCtx.res.statusCode).toBe(403);
      expect(mocks.createChatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('Non-streaming chat completions', () => {
    it('returns raw OpenAI ChatCompletion JSON without FastGPT wrapper and rewrites modelId to modelData.model', async () => {
      const token = createInvokeToken({ teamId: 'team-1' });
      const rawOpenAICompletion = {
        id: 'chatcmpl-nonstream-1',
        object: 'chat.completion',
        created: 1700000001,
        model: 'deepseek-r1-private',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '{"summary":"ok"}',
              reasoning_content: 'thinking step'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 18,
          completion_tokens: 12,
          total_tokens: 30
        }
      };

      mocks.createChatCompletion.mockResolvedValueOnce({
        response: rawOpenAICompletion,
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: false }
      });

      const requestPayload: InvokeChatCompletionsBodyType = {
        model: TEAM_1_LLM_ID,
        messages: [
          { role: 'system', content: 'Return JSON.' },
          { role: 'user', content: 'Hello world' }
        ],
        temperature: 0.7,
        max_tokens: 99999,
        stop: ['\nEND', 'a|b'],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'summary_schema',
            schema: { type: 'object', properties: { summary: { type: 'string' } } }
          }
        },
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_time',
              parameters: { type: 'object', properties: {} }
            }
          }
        ],
        tool_choice: 'auto'
      };

      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: requestPayload
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(200);
      // 必须直接返回原生 OpenAI ChatCompletion 结构，不能被 NextAPI 包装为 { code: 200, data }。
      expect(ctx.getJsonPayload()).toEqual(rawOpenAICompletion);
      expect(ctx.getJsonPayload()).not.toHaveProperty('code');
      expect(ctx.getJsonPayload()).not.toHaveProperty('data');

      expect(mocks.createChatCompletion).toHaveBeenCalledTimes(1);
      const callArgs = mocks.createChatCompletion.mock.calls[0][0];
      expect(callArgs.modelData.modelId).toBe(TEAM_1_LLM_ID);
      expect(callArgs.body.model).toBe('deepseek-r1-private');
      expect(callArgs.body.model).not.toBe(TEAM_1_LLM_ID);
      expect(callArgs.body.stream).toBe(false);
      expect(callArgs.body).not.toHaveProperty('stream_options');
      expect(callArgs.body.temperature).toBe(0.7);
      expect(callArgs.body.max_tokens).toBe(4096);
      expect(callArgs.body.stop).toEqual(['\nEND', 'a|b']);
      expect(callArgs.body.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'summary_schema',
          schema: { type: 'object', properties: { summary: { type: 'string' } } }
        }
      });
      expect(callArgs.body.tools).toHaveLength(1);
      expect(callArgs.body.tool_choice).toBe('auto');
    });
  });

  describe('Streaming SSE chat completions', () => {
    it('streams standard text/event-stream OpenAI chunks with include_usage enabled and finishes with data: [DONE]', async () => {
      const token = createInvokeToken({ teamId: 'team-1' });
      const streamChunks = [
        {
          id: 'chatcmpl-stream-1',
          object: 'chat.completion.chunk',
          created: 1700000002,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Hello ' },
              finish_reason: null
            }
          ]
        },
        {
          id: 'chatcmpl-stream-1',
          object: 'chat.completion.chunk',
          created: 1700000002,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              delta: { content: 'Plugin!' },
              finish_reason: 'stop'
            }
          ]
        },
        {
          id: 'chatcmpl-stream-1',
          object: 'chat.completion.chunk',
          created: 1700000002,
          model: 'gpt-4o-2024-11-20',
          choices: [],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 4,
            total_tokens: 14
          }
        }
      ];

      const upstreamAbort = vi.fn();
      async function* generateChunks() {
        for (const chunk of streamChunks) {
          yield chunk;
        }
      }
      const mockStreamResponse = Object.assign(generateChunks(), {
        controller: { abort: upstreamAbort }
      });

      mocks.createChatCompletion.mockResolvedValueOnce({
        response: mockStreamResponse,
        isStreamResponse: true,
        requestMeta: { usedUserOpenAIKey: false }
      });

      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Greet plugin' }],
          stream: true
        }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(200);
      expect(ctx.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
      expect(ctx.headers.get('cache-control')).toBe('no-cache, no-transform');
      expect(ctx.headers.get('connection')).toBe('keep-alive');
      expect(ctx.res.writableEnded).toBe(true);

      const callArgs = mocks.createChatCompletion.mock.calls[0][0];
      expect(callArgs.body.model).toBe('gpt-4o-2024-11-20');
      expect(callArgs.body.stream).toBe(true);
      expect(callArgs.body.stream_options).toEqual({ include_usage: true });

      const rawSseOutput = ctx.writtenChunks.join('');
      expect(rawSseOutput).toBe(
        [
          ...streamChunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`),
          'data: [DONE]\n\n'
        ].join('')
      );
      expect(upstreamAbort).not.toHaveBeenCalled();
    });

    it('aborts upstream stream cleanly when client disconnects mid-stream', async () => {
      const token = createInvokeToken({ teamId: 'team-1' });
      const upstreamAbort = vi.fn();

      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Long answer' }],
          stream: true
        }
      });

      async function* generateInterruptedStream() {
        yield {
          id: 'chatcmpl-abort-1',
          object: 'chat.completion.chunk',
          created: 1700000003,
          model: 'gpt-4o-2024-11-20',
          choices: [{ index: 0, delta: { content: 'Part 1' }, finish_reason: null }]
        };
        // 模拟客户端在收到首帧后主动断开连接。
        ctx.req.aborted = true;
        ctx.req.emit('close');
        yield {
          id: 'chatcmpl-abort-1',
          object: 'chat.completion.chunk',
          created: 1700000003,
          model: 'gpt-4o-2024-11-20',
          choices: [{ index: 0, delta: { content: 'Part 2' }, finish_reason: 'stop' }]
        };
      }

      mocks.createChatCompletion.mockResolvedValueOnce({
        response: Object.assign(generateInterruptedStream(), {
          controller: { abort: upstreamAbort }
        }),
        isStreamResponse: true,
        requestMeta: { usedUserOpenAIKey: false }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      const callSignal = mocks.createChatCompletion.mock.calls[0][0].options?.signal as AbortSignal;
      expect(callSignal.aborted).toBe(true);
      expect(upstreamAbort).toHaveBeenCalledTimes(1);

      const rawSseOutput = ctx.writtenChunks.join('');
      expect(rawSseOutput).toContain('Part 1');
      expect(rawSseOutput).not.toContain('Part 2');
      expect(rawSseOutput).not.toContain('data: [DONE]');
    });
  });

  describe('Input validation via parseApiInput', () => {
    it('returns 400 when body fails InvokeChatCompletionsBodySchema validation', async () => {
      const token = createInvokeToken();
      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: []
        }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(400);
      expect(ctx.getJsonPayload()).toMatchObject({
        error: {
          type: 'invalid_request_error',
          code: 'invalid_request_error'
        }
      });
      expect(mocks.getTeamModelHandle).not.toHaveBeenCalled();
      expect(mocks.createChatCompletion).not.toHaveBeenCalled();
    });
  });

  describe('Real-time model usage billing (Task 6)', () => {
    it('pushes usage item via pushChatItemUsage for non-streaming calls with resolved tool name and computed points', async () => {
      const usageId = '67f000000000000000000101';
      const token = createInvokeToken({
        teamId: 'team-1',
        usageId,
        toolId: 'systemTool-webSearch'
      });

      mocks.createChatCompletion.mockResolvedValueOnce({
        response: {
          id: 'chatcmpl-bill-1',
          object: 'chat.completion',
          created: 1700000101,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Done'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150
          }
        },
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: false }
      });

      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Analyze this' }]
        }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(200);
      expect(mocks.countGptMessagesTokens).not.toHaveBeenCalled();
      // 系统模型单价：inputPrice = 1000 / 1M，outputPrice = 2000 / 1M -> (100*1000 + 50*2000) / 1_000_000 = 0.2
      expect(mocks.pushChatItemUsage).toHaveBeenCalledTimes(1);
      expect(mocks.pushChatItemUsage).toHaveBeenCalledWith({
        teamId: 'team-1',
        usageId,
        nodeUsages: [
          {
            moduleName: 'Web Search Tool',
            modelId: ACTIVE_SYSTEM_LLM_ID,
            inputTokens: 100,
            outputTokens: 50,
            totalPoints: 0.2
          }
        ]
      });
      expect(mocks.createUsage).not.toHaveBeenCalled();

      // 用户自带 OpenAI Key 时 totalPoints 应记为 0。
      mocks.createChatCompletion.mockResolvedValueOnce({
        response: {
          id: 'chatcmpl-bill-user-key',
          object: 'chat.completion',
          created: 1700000102,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Done with user key' },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150
          }
        },
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: true }
      });

      const userKeyCtx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Analyze with user key' }]
        }
      });
      await completionsRoute(userKeyCtx.req as any, userKeyCtx.res as any);

      expect(mocks.pushChatItemUsage).toHaveBeenLastCalledWith({
        teamId: 'team-1',
        usageId,
        nodeUsages: [
          {
            moduleName: 'Web Search Tool',
            modelId: ACTIVE_SYSTEM_LLM_ID,
            inputTokens: 100,
            outputTokens: 50,
            totalPoints: 0
          }
        ]
      });
    });

    it('pushes separate usage items when the same tool invocation calls models multiple times under the same usageId', async () => {
      const sharedUsageId = '67f000000000000000000102';
      const token = createInvokeToken({
        teamId: 'team-1',
        usageId: sharedUsageId,
        toolId: 'systemTool-webSearch'
      });

      mocks.createChatCompletion
        .mockResolvedValueOnce({
          response: {
            id: 'chatcmpl-multi-1',
            object: 'chat.completion',
            created: 1700000103,
            model: 'gpt-4o-2024-11-20',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Step 1' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 }
          },
          isStreamResponse: false,
          requestMeta: { usedUserOpenAIKey: false }
        })
        .mockResolvedValueOnce({
          response: {
            id: 'chatcmpl-multi-2',
            object: 'chat.completion',
            created: 1700000104,
            model: 'gpt-4o-2024-11-20',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Step 2' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }
          },
          isStreamResponse: false,
          requestMeta: { usedUserOpenAIKey: false }
        });

      const ctx1 = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'First prompt' }]
        }
      });
      const ctx2 = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Second prompt' }]
        }
      });

      await completionsRoute(ctx1.req as any, ctx1.res as any);
      await completionsRoute(ctx2.req as any, ctx2.res as any);

      expect(mocks.pushChatItemUsage).toHaveBeenCalledTimes(2);
      expect(mocks.pushChatItemUsage).toHaveBeenNthCalledWith(1, {
        teamId: 'team-1',
        usageId: sharedUsageId,
        nodeUsages: [
          {
            moduleName: 'Web Search Tool',
            modelId: ACTIVE_SYSTEM_LLM_ID,
            inputTokens: 40,
            outputTokens: 10,
            totalPoints: 0.06
          }
        ]
      });
      expect(mocks.pushChatItemUsage).toHaveBeenNthCalledWith(2, {
        teamId: 'team-1',
        usageId: sharedUsageId,
        nodeUsages: [
          {
            moduleName: 'Web Search Tool',
            modelId: ACTIVE_SYSTEM_LLM_ID,
            inputTokens: 120,
            outputTokens: 30,
            totalPoints: 0.18
          }
        ]
      });
    });

    it('settles streaming usage exactly once with final chunk usage, and falls back to countGptMessagesTokens when stream is interrupted before usage chunk', async () => {
      const usageId = '67f000000000000000000103';
      const token = createInvokeToken({
        teamId: 'team-1',
        usageId,
        toolId: 'systemTool-webSearch'
      });

      // 场景 A：流正常结束并携带末尾 usage 分片 -> 幂等结算一次，不触发 tiktoken 兜底。
      async function* normalStreamWithUsage() {
        yield {
          id: 'chatcmpl-stream-bill-1',
          object: 'chat.completion.chunk',
          created: 1700000105,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Stream answer' },
              finish_reason: 'stop'
            }
          ]
        };
        yield {
          id: 'chatcmpl-stream-bill-1',
          object: 'chat.completion.chunk',
          created: 1700000105,
          model: 'gpt-4o-2024-11-20',
          choices: [],
          usage: {
            prompt_tokens: 25,
            completion_tokens: 15,
            total_tokens: 40
          }
        };
      }

      mocks.createChatCompletion.mockResolvedValueOnce({
        response: Object.assign(normalStreamWithUsage(), { controller: { abort: vi.fn() } }),
        isStreamResponse: true,
        requestMeta: { usedUserOpenAIKey: false }
      });

      const normalCtx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Stream please' }],
          stream: true
        }
      });
      await completionsRoute(normalCtx.req as any, normalCtx.res as any);

      expect(mocks.pushChatItemUsage).toHaveBeenCalledTimes(1);
      expect(mocks.countGptMessagesTokens).not.toHaveBeenCalled();
      expect(mocks.pushChatItemUsage).toHaveBeenCalledWith({
        teamId: 'team-1',
        usageId,
        nodeUsages: [
          {
            moduleName: 'Web Search Tool',
            modelId: ACTIVE_SYSTEM_LLM_ID,
            inputTokens: 25,
            outputTokens: 15,
            totalPoints: 0.055
          }
        ]
      });

      // 场景 B：流在到达 usage 分片前中断（且记账钩子抛错也不得阻断 res.end()）。
      vi.clearAllMocks();
      mocks.getTeamModelHandle.mockResolvedValue(buildCatalogHandleForTeam1());
      mocks.getSystemToolDisplayInfo.mockResolvedValue({
        id: 'systemTool-webSearch',
        name: '联网搜索工具'
      });
      mocks.countGptMessagesTokens.mockResolvedValueOnce(32).mockResolvedValueOnce(14);
      mocks.pushChatItemUsage.mockImplementationOnce(() => {
        throw new Error('simulated billing write error');
      });

      const interruptedCtx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Interrupted stream request' }],
          stream: true
        }
      });

      async function* interruptedBeforeUsageStream() {
        yield {
          id: 'chatcmpl-stream-bill-2',
          object: 'chat.completion.chunk',
          created: 1700000106,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                reasoning_content: 'think...',
                content: 'Partial output'
              },
              finish_reason: null
            }
          ]
        };
        interruptedCtx.req.aborted = true;
        interruptedCtx.req.emit('close');
        yield {
          id: 'chatcmpl-stream-bill-2',
          object: 'chat.completion.chunk',
          created: 1700000106,
          model: 'gpt-4o-2024-11-20',
          choices: [],
          usage: { prompt_tokens: 999, completion_tokens: 999, total_tokens: 1998 }
        };
      }

      mocks.createChatCompletion.mockResolvedValueOnce({
        response: Object.assign(interruptedBeforeUsageStream(), { controller: { abort: vi.fn() } }),
        isStreamResponse: true,
        requestMeta: { usedUserOpenAIKey: false }
      });

      await completionsRoute(interruptedCtx.req as any, interruptedCtx.res as any);

      expect(mocks.countGptMessagesTokens).toHaveBeenCalledTimes(2);
      expect(mocks.countGptMessagesTokens).toHaveBeenNthCalledWith(2, {
        messages: [
          {
            role: 'assistant',
            content: 'Partial output',
            reasoning_content: 'think...'
          }
        ]
      });
      expect(mocks.pushChatItemUsage).toHaveBeenCalledTimes(1);
      expect(mocks.pushChatItemUsage).toHaveBeenCalledWith({
        teamId: 'team-1',
        usageId,
        nodeUsages: [
          {
            moduleName: '联网搜索工具',
            modelId: ACTIVE_SYSTEM_LLM_ID,
            inputTokens: 32,
            outputTokens: 14,
            totalPoints: 0.06
          }
        ]
      });
      expect(interruptedCtx.res.writableEnded).toBe(true);
    });

    it('falls back to createUsage with UsageSourceEnum.plugin when usageId is absent, and skips fallback billing for debug toolIds', async () => {
      // 场景 A：无 usageId 的非调试工具调用 -> 兜底调用 createUsage(source: UsageSourceEnum.plugin)
      const tokenWithoutUsageId = new InvokeProcessor({
        appId: 'app-1',
        chatId: 'chat-1',
        uId: 'user-1',
        teamId: 'team-1',
        tmbId: 'member-1',
        permissions: [PluginPermissionEnum['model:invoke']],
        toolId: 'systemTool-webSearch'
      }).generateToken();

      mocks.createChatCompletion.mockResolvedValueOnce({
        response: {
          id: 'chatcmpl-fallback-1',
          object: 'chat.completion',
          created: 1700000107,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Standalone plugin call' },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 25,
            total_tokens: 75
          }
        },
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: false }
      });

      const nonDebugCtx = createMockHttpContext({
        authorization: `Bearer ${tokenWithoutUsageId}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Standalone query' }]
        }
      });

      await completionsRoute(nonDebugCtx.req as any, nonDebugCtx.res as any);

      expect(nonDebugCtx.res.statusCode).toBe(200);
      expect(mocks.pushChatItemUsage).not.toHaveBeenCalled();
      expect(mocks.createUsage).toHaveBeenCalledTimes(1);
      expect(mocks.createUsage).toHaveBeenCalledWith({
        teamId: 'team-1',
        tmbId: 'member-1',
        appName: 'Web Search Tool',
        totalPoints: 0.1,
        source: UsageSourceEnum.plugin,
        list: [
          {
            moduleName: 'Web Search Tool',
            amount: 0.1,
            modelId: ACTIVE_SYSTEM_LLM_ID,
            inputTokens: 50,
            outputTokens: 25
          }
        ]
      });

      // 场景 B：无 usageId 且 toolId 属于本地调试（debug:tmbId:... 或 debug-...）-> 跳过兜底计费
      vi.clearAllMocks();
      mocks.getTeamModelHandle.mockResolvedValue(buildCatalogHandleForTeam1());

      for (const debugToolId of ['debug:tmbId:member-1', 'debug-localTool']) {
        const debugToken = new InvokeProcessor({
          appId: 'app-1',
          chatId: 'chat-1',
          uId: 'user-1',
          teamId: 'team-1',
          tmbId: 'member-1',
          permissions: [PluginPermissionEnum['model:invoke']],
          toolId: debugToolId
        }).generateToken();

        mocks.createChatCompletion.mockResolvedValueOnce({
          response: {
            id: 'chatcmpl-debug-skip',
            object: 'chat.completion',
            created: 1700000108,
            model: 'gpt-4o-2024-11-20',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'Debug response' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
          },
          isStreamResponse: false,
          requestMeta: { usedUserOpenAIKey: false }
        });

        const debugCtx = createMockHttpContext({
          authorization: `Bearer ${debugToken}`,
          body: {
            model: ACTIVE_SYSTEM_LLM_ID,
            messages: [{ role: 'user', content: 'Debug query' }]
          }
        });

        await completionsRoute(debugCtx.req as any, debugCtx.res as any);
        expect(debugCtx.res.statusCode).toBe(200);
      }

      expect(mocks.pushChatItemUsage).not.toHaveBeenCalled();
      expect(mocks.createUsage).not.toHaveBeenCalled();
    });
  });

  describe('model ACL, workflow pre-authorization & AI points guard', () => {
    it('enforces member-level assertAuthModels and returns 403 when model is not pre-authorized', async () => {
      mocks.assertAuthModels.mockRejectedValueOnce(new UserError(ModelErrEnum.unAuthModel));

      const token = new InvokeProcessor({
        appId: 'app-1',
        chatId: 'chat-1',
        uId: 'user-1',
        teamId: 'team-1',
        tmbId: 'member-no-acl',
        permissions: [PluginPermissionEnum['model:invoke']]
      }).generateToken();

      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(403);
      expect(ctx.getJsonPayload()).toEqual({
        error: {
          message: expect.any(String),
          type: 'permission_error',
          code: 'model_access_denied'
        }
      });
      expect(mocks.assertAuthModels).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: {
            teamId: 'team-1',
            tmbId: 'member-no-acl',
            isRoot: false
          },
          modelIds: [ACTIVE_SYSTEM_LLM_ID],
          action: 'use'
        })
      );
      expect(mocks.createChatCompletion).not.toHaveBeenCalled();
    });

    it('bypasses member assertAuthModels when modelId is pre-authorized by workflow resource snapshot', async () => {
      mocks.assertAuthModels.mockRejectedValue(new UserError(ModelErrEnum.unAuthModel));
      mocks.createChatCompletion.mockResolvedValueOnce({
        response: {
          id: 'chatcmpl-preauth',
          object: 'chat.completion',
          created: 1700000200,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Snapshot authorized' },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        },
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: false }
      });

      const token = new InvokeProcessor({
        appId: 'app-1',
        chatId: 'chat-1',
        uId: 'user-1',
        teamId: 'team-1',
        tmbId: 'member-no-acl',
        authorizedModelIds: [ACTIVE_SYSTEM_LLM_ID],
        permissions: [PluginPermissionEnum['model:invoke']]
      }).generateToken();

      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(200);
      expect(mocks.assertAuthModels).not.toHaveBeenCalled();
      expect(mocks.createChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('forwards session.isRoot to assertAuthModels when model is not in snapshot', async () => {
      mocks.createChatCompletion.mockResolvedValueOnce({
        response: {
          id: 'chatcmpl-root',
          object: 'chat.completion',
          created: 1700000201,
          model: 'gpt-4o-2024-11-20',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Root ok' },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        },
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: false }
      });

      const token = new InvokeProcessor({
        appId: 'app-1',
        chatId: 'chat-1',
        uId: 'root-user',
        teamId: 'team-1',
        tmbId: 'root-tmb',
        isRoot: true,
        permissions: [PluginPermissionEnum['model:invoke']]
      }).generateToken();

      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(200);
      expect(mocks.assertAuthModels).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: {
            teamId: 'team-1',
            tmbId: 'root-tmb',
            isRoot: true
          },
          modelIds: [ACTIVE_SYSTEM_LLM_ID],
          action: 'use'
        })
      );
    });

    it('returns 402 insufficient_quota and skips upstream call when team AI points are exhausted', async () => {
      mocks.checkTeamAIPoints.mockRejectedValueOnce(TeamErrEnum.aiPointsNotEnough);

      const token = new InvokeProcessor({
        appId: 'app-1',
        chatId: 'chat-1',
        uId: 'user-1',
        teamId: 'team-1',
        tmbId: 'member-1',
        authorizedModelIds: [ACTIVE_SYSTEM_LLM_ID],
        permissions: [PluginPermissionEnum['model:invoke']]
      }).generateToken();

      const ctx = createMockHttpContext({
        authorization: `Bearer ${token}`,
        body: {
          model: ACTIVE_SYSTEM_LLM_ID,
          messages: [{ role: 'user', content: 'Hello' }]
        }
      });

      await completionsRoute(ctx.req as any, ctx.res as any);

      expect(ctx.res.statusCode).toBe(402);
      expect(ctx.getJsonPayload()).toEqual({
        error: {
          message: 'Team AI points are not enough',
          type: 'insufficient_quota',
          code: 'insufficient_quota'
        }
      });
      expect(mocks.checkTeamAIPoints).toHaveBeenCalledWith('team-1');
      expect(mocks.createChatCompletion).not.toHaveBeenCalled();
    });
  });
});
