import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { isModelConfigError } from '@fastgpt/global/common/error/model';
import { getErrText, isUserConfigError, UserError } from '@fastgpt/global/common/error/utils';
import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  CompletionUsage,
  UnStreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import { getLLMSupportParams } from '@fastgpt/global/core/ai/llm/utils';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import { isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';
import {
  InvokeChatCompletionsBodySchema,
  InvokeUpstreamChatCompletionChunkSchema,
  InvokeUpstreamChatCompletionSchema,
  type InvokeChatCompletionsBodyType,
  type InvokeOpenAIErrorResponseType
} from '@fastgpt/global/openapi/plugin/invoke';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { countGptMessagesTokens } from '@fastgpt/service/common/string/tiktoken';
import {
  ApiRequestInputParseError,
  parseApiInput
} from '@fastgpt/service/common/zod/requestParseError';
import { createChatCompletion } from '@fastgpt/service/core/ai/llm/request/createChatCompletion';
import { llmCompletionsBodyFormat } from '@fastgpt/service/core/ai/llm/request/requestBody';
import { normalizeLLMCacheUsage } from '@fastgpt/service/core/ai/llm/request/response/normalize';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { InvokeProcessor } from '@fastgpt/service/support/invoke/invoke';
import type { InvokeSessionType } from '@fastgpt/service/support/invoke/type';
import { assertAuthModels } from '@fastgpt/service/support/permission/model/auth';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { createUsage, pushChatItemUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

type OpenAIErrorPayload = {
  status: number;
  message: string;
  type:
    | 'invalid_request_error'
    | 'authentication_error'
    | 'permission_error'
    | 'insufficient_quota'
    | 'rate_limit_error'
    | 'upstream_error';
  code: string;
};

/**
 * 反向模型调用单次请求结算上下文，供后续实时账单计费（Task 6）直接消费。
 * 非流式请求在拿到响应后结算一次；流式请求在正常完成、客户端断连或流异常的 finally 阶段幂等结算一次。
 */
export type InvokeChatCompletionUsageContext = {
  processor: InvokeProcessor;
  session: InvokeSessionType;
  modelData: LLMModelDataType;
  requestBody: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;
  usage?: CompletionUsage;
  streamAccumulated?: {
    answerText: string;
    reasoningText: string;
    toolCallArguments: string;
  };
  usedUserOpenAIKey: boolean;
  aborted: boolean;
  lang?: string;
};

/**
 * 判断 session.toolId 是否来自本地调试通道（如 `debug:tmbId:...` 或 `debug-...`）。
 * 无 usageId 的纯调试调用不创建兜底 Usage 账单。
 */
const isDebugInvokeToolId = (toolId?: string): boolean => {
  const trimmedToolId = toolId?.trim() ?? '';
  if (trimmedToolId === '') {
    return false;
  }
  return (
    trimmedToolId.startsWith('debug:') ||
    trimmedToolId.startsWith('debug-') ||
    isDebugToolSource(trimmedToolId)
  );
};

/**
 * 从非流式完整响应中提取生成的文本、思考内容与工具调用参数，
 * 供上游未返回 usage 时兜底统计输出 Token。
 */
const extractAccumulatedFromCompletion = (completion: UnStreamResponseType) => {
  let answerText = '';
  let reasoningText = '';
  let toolCallArguments = '';

  for (const choice of completion.choices ?? []) {
    const message = choice.message as
      | (typeof choice.message & { reasoning_content?: unknown })
      | undefined;
    if (typeof message?.content === 'string') {
      answerText += message.content;
    }
    if (typeof message?.reasoning_content === 'string') {
      reasoningText += message.reasoning_content;
    }
    if (message?.tool_calls?.length) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function' && typeof toolCall.function?.arguments === 'string') {
          toolCallArguments += toolCall.function.arguments;
        }
      }
    }
  }

  return {
    answerText,
    reasoningText,
    toolCallArguments
  };
};

/**
 * 反向模型调用实时计费结算：
 * 1. 优先使用上游返回的 prompt_tokens / completion_tokens；缺失或流提前中断时回退到 countGptMessagesTokens 估算实际收发 Token；
 * 2. 通过 formatModelChars2Points 计算积分（用户自定义 OpenAI Key 场景积分记为 0）；
 * 3. 解析发起调用的工具名称作为 moduleName，存在 usageId 时调用 pushChatItemUsage 追加明细，无 usageId 且非调试工具时兜底调用 createUsage；
 * 4. 内部吞掉任何非预期异常并记录错误日志，确保绝不阻断 JSON 返回或 SSE res.end()。
 */
export const settleInvokeModelUsage = async (
  context: InvokeChatCompletionUsageContext
): Promise<void> => {
  try {
    const answerText = context.streamAccumulated?.answerText ?? '';
    const reasoningText = context.streamAccumulated?.reasoningText ?? '';
    const toolCallArguments = context.streamAccumulated?.toolCallArguments ?? '';
    const hasAccumulatedOutput =
      answerText !== '' || reasoningText !== '' || toolCallArguments !== '';

    // 1. 计算输入与输出 Token：缺失真实 usage 时使用 tiktoken worker 兜底统计。
    const inputTokens = await (async () => {
      if (typeof context.usage?.prompt_tokens === 'number' && context.usage.prompt_tokens > 0) {
        return context.usage.prompt_tokens;
      }
      return countGptMessagesTokens({
        messages: context.requestBody.messages as ChatCompletionMessageParam[],
        tools: context.requestBody.tools as ChatCompletionTool[] | undefined
      });
    })();

    const outputTokens = await (async () => {
      if (
        typeof context.usage?.completion_tokens === 'number' &&
        (context.usage.completion_tokens > 0 || !hasAccumulatedOutput)
      ) {
        return context.usage.completion_tokens;
      }

      if (!hasAccumulatedOutput) {
        return 0;
      }

      const assistantMessage: ChatCompletionAssistantMessageParam = {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        ...(answerText !== '' ? { content: answerText } : {}),
        ...(reasoningText !== '' ? { reasoning_content: reasoningText } : {}),
        ...(toolCallArguments !== ''
          ? {
              tool_calls: [
                {
                  id: 'invoke_tool_call',
                  type: 'function',
                  function: {
                    name: '',
                    arguments: toolCallArguments
                  }
                }
              ]
            }
          : {})
      };

      return countGptMessagesTokens({
        messages: [assistantMessage]
      });
    })();

    // 2. 提取缓存读写 Token 并按最新模型定价计算积分（用户自带 Key 时按平台惯例记为 0 积分）。
    const { cacheReadTokens, cacheCreationTokens } = context.usage
      ? normalizeLLMCacheUsage(context.usage)
      : { cacheReadTokens: 0, cacheCreationTokens: 0 };
    const { totalPoints: calculatedPoints, modelId } = formatModelChars2Points({
      model: context.modelData,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens
    });
    const totalPoints = context.usedUserOpenAIKey ? 0 : calculatedPoints;

    // 3. 解析工具展示名作为账单模块名。
    const moduleName = await context.processor.resolveToolName({ lang: context.lang });

    // 4. 优先写入当前对话/工作流 usageId；无 usageId 且非调试来源时创建独立插件账单。
    const usageId = context.session.usageId?.trim() ?? '';
    if (usageId !== '') {
      await pushChatItemUsage({
        teamId: context.session.teamId,
        usageId,
        nodeUsages: [
          {
            moduleName,
            modelId,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheCreationTokens,
            totalPoints
          }
        ]
      });
      return;
    }

    if (isDebugInvokeToolId(context.session.toolId)) {
      return;
    }

    await createUsage({
      teamId: context.session.teamId,
      tmbId: context.session.tmbId,
      appName: moduleName,
      totalPoints,
      source: UsageSourceEnum.plugin,
      list: [
        {
          moduleName,
          amount: totalPoints,
          modelId,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens
        }
      ]
    });
  } catch (error) {
    logger.error('Failed to settle invoke model usage', { error });
  }
};

/**
 * 直接向响应写入标准 OpenAI 错误结构 `{ error: { message, type, code } }`，
 * 避免进入统一 `{ code, data }` 包装，确保官方 OpenAI SDK 能准确解析为对应 APIError。
 */
const sendOpenAIError = (res: NextApiResponse, payload: OpenAIErrorPayload) => {
  const body: InvokeOpenAIErrorResponseType = {
    error: {
      message: payload.message,
      type: payload.type,
      code: payload.code
    }
  };
  res.status(payload.status).json(body);
};

/**
 * 从请求头提取标准 Bearer Token；非 Bearer 方案或空凭证统一返回空字符串。
 */
const extractBearerToken = (authorization?: string | string[]): string => {
  const rawHeader = Array.isArray(authorization) ? authorization[0] : authorization;
  if (rawHeader === undefined || rawHeader === '') {
    return '';
  }

  const match = rawHeader.trim().match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
};

/**
 * 基于 session 严格解析并校验目标 LLM 模型：
 * - 仅允许通过平台 modelId 精确匹配，禁止按模型名隐式匹配，也绝不回退系统默认模型；
 * - 目标模型不存在、已停用或非 LLM 类型返回 400；
 * - 跨团队归属或未命中工作流资源快照且无成员 `use` 权限的模型返回 403。
 */
const resolveAuthorizedTeamLLMModel = async ({
  teamId,
  tmbId,
  isRoot,
  authorizedModelIds,
  modelId
}: {
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
  authorizedModelIds?: string[];
  modelId: string;
}): Promise<
  { ok: true; modelData: LLMModelDataType } | { ok: false; error: OpenAIErrorPayload }
> => {
  try {
    const modelHandle = await getTeamModelHandle({ teamId });
    const modelData = modelHandle.getModelData({ modelId }, { type: ModelTypeEnum.llm });

    if (!modelData || !modelData.isActive || modelData.type !== ModelTypeEnum.llm) {
      return {
        ok: false,
        error: {
          status: 400,
          message: `Model "${modelId}" is not found or disabled`,
          type: 'invalid_request_error',
          code: 'model_not_found'
        }
      };
    }

    if (isTeamModel(modelData) && String(modelData.teamId) !== teamId) {
      return {
        ok: false,
        error: {
          status: 403,
          message: `Model "${modelId}" is not accessible by current team`,
          type: 'permission_error',
          code: 'model_access_denied'
        }
      };
    }

    // 命中当前工作流版本资源快照时直接放行（沿用应用发布者授权），否则按当前运行成员执行模型 `use` ACL 校验。
    const isPreAuthorized = Boolean(authorizedModelIds?.includes(modelData.modelId));
    if (!isPreAuthorized) {
      await assertAuthModels({
        actor: {
          teamId,
          tmbId,
          isRoot: isRoot ?? false
        },
        modelIds: [modelData.modelId],
        action: 'use',
        handle: modelHandle
      });
    }

    return { ok: true, modelData };
  } catch (error) {
    const errKey = typeof error === 'string' ? error : (error as { message?: string })?.message;

    if (errKey === ModelErrEnum.unAuthModel || errKey === ERROR_ENUM.unAuthModel) {
      return {
        ok: false,
        error: {
          status: 403,
          message:
            error instanceof UserError && error.displayMessage
              ? error.displayMessage
              : `Model "${modelId}" is not authorized for current team`,
          type: 'permission_error',
          code: 'model_access_denied'
        }
      };
    }

    if (isModelConfigError(error) || error instanceof UserError) {
      return {
        ok: false,
        error: {
          status: 400,
          message:
            error instanceof UserError && error.displayMessage
              ? error.displayMessage
              : `Model "${modelId}" is not found or disabled`,
          type: 'invalid_request_error',
          code: 'model_not_found'
        }
      };
    }

    throw error;
  }
};

/**
 * 将插件传入的标准 OpenAI 请求体格式化为上游模型请求体：
 * - 复用 llmCompletionsBodyFormat 完成真实模型名替换（modelData.model）、最大回复 Token 裁剪、工具参数清洗、不支持参数剥离、fieldMap 与 defaultConfig 合并；
 * - 保持 OpenAI 原生 temperature（0~maxTemperature）与 stop（string | string[]）语义，避免被工作流 0~10 温度比例误缩放；
 * - 流式模式下自动开启 stream_options.include_usage，确保末尾分片携带真实 usage 供计费统计。
 */
const formatInvokeCompletionRequestBody = async ({
  body,
  modelData,
  isStream
}: {
  body: InvokeChatCompletionsBodyType;
  modelData: LLMModelDataType;
  isStream: boolean;
}): Promise<ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming> => {
  const {
    model: _requestedModelId,
    messages,
    stream: _stream,
    stream_options,
    temperature,
    max_tokens,
    max_completion_tokens,
    tools,
    tool_choice,
    parallel_tool_calls,
    response_format,
    stop,
    ...restOpenAIFields
  } = body;

  const normalizedResponseFormat = (() => {
    if (!response_format) return undefined;
    if (response_format.type === 'json_schema') {
      return {
        type: 'json_schema',
        json_schema:
          typeof response_format.json_schema === 'string'
            ? response_format.json_schema
            : JSON.stringify(response_format.json_schema)
      };
    }
    return { type: response_format.type };
  })();

  const { requestBody } = await llmCompletionsBodyFormat<ChatCompletionCreateParams>({
    ...(restOpenAIFields as Record<string, unknown>),
    model: modelData,
    messages,
    stream: isStream,
    max_tokens,
    max_completion_tokens,
    temperature: undefined,
    stop: Array.isArray(stop) ? stop.join('|') : stop,
    response_format: normalizedResponseFormat,
    tools: tools as ChatCompletionTool[] | undefined,
    tool_choice,
    parallel_tool_calls,
    toolCallMode: tools?.length ? 'toolChoice' : undefined
  });

  const mutableBody: Record<string, unknown> = { ...requestBody };
  const supportParams = getLLMSupportParams(modelData);
  const defaultConfig = modelData.config.defaultConfig ?? {};

  // 保留 OpenAI 原生温度区间并按模型上限截断，尊重 fieldMap 与 defaultConfig 覆盖优先级。
  if (
    typeof temperature === 'number' &&
    supportParams.temperature &&
    typeof modelData.config.maxTemperature === 'number'
  ) {
    const targetTempKey = modelData.config.fieldMap?.temperature ?? 'temperature';
    if (!Object.hasOwn(defaultConfig, targetTempKey)) {
      mutableBody[targetTempKey] = Math.min(
        Math.max(temperature, 0),
        modelData.config.maxTemperature
      );
    }
  }

  // 保留 OpenAI 原生 stop 字符串或数组（避免含换行或竖线的序列被工作流分隔符逻辑改写）。
  if (stop !== undefined && supportParams.stop) {
    const targetStopKey = modelData.config.fieldMap?.stop ?? 'stop';
    if (!Object.hasOwn(defaultConfig, targetStopKey)) {
      mutableBody[targetStopKey] = stop;
    }
  }

  if (isStream) {
    mutableBody.stream = true;
    if (!Object.hasOwn(defaultConfig, 'stream_options')) {
      mutableBody.stream_options = {
        ...stream_options,
        include_usage: true
      };
    }
    return mutableBody as unknown as ChatCompletionCreateParamsStreaming;
  }

  mutableBody.stream = false;
  delete mutableBody.stream_options;
  return mutableBody as unknown as ChatCompletionCreateParamsNonStreaming;
};

/**
 * 将未发送响应头前的上游调用异常映射为 OpenAI 兼容错误载荷。
 */
const mapUpstreamErrorToOpenAIError = (error: unknown): OpenAIErrorPayload => {
  if (isUserConfigError(error)) {
    return {
      status: 400,
      message: getErrText(error, 'Invalid model configuration'),
      type: 'invalid_request_error',
      code: 'invalid_model_config'
    };
  }

  const upstreamStatus =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;

  if (upstreamStatus === 400 || upstreamStatus === 422) {
    return {
      status: 400,
      message: getErrText(error, 'Upstream rejected chat completion parameters'),
      type: 'invalid_request_error',
      code: 'upstream_bad_request'
    };
  }

  if (upstreamStatus === 429) {
    return {
      status: 429,
      message: getErrText(error, 'Upstream rate limit exceeded'),
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded'
    };
  }

  const resolvedStatus =
    typeof upstreamStatus === 'number' && upstreamStatus >= 500 && upstreamStatus <= 599
      ? upstreamStatus
      : 502;

  return {
    status: resolvedStatus,
    message: getErrText(error, 'Upstream model request failed'),
    type: 'upstream_error',
    code: 'upstream_error'
  };
};

/**
 * 从上游 HTTP 200 载荷或 SSE 帧中识别协议层错误对象（如 `{ error: { message } }`）。
 */
const extractUpstreamPayloadError = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return undefined;
  }
  const errorValue = (payload as { error?: unknown }).error;
  if (!errorValue) {
    return undefined;
  }
  if (typeof errorValue === 'string') {
    return errorValue.trim() || 'Upstream returned an error payload';
  }
  if (typeof errorValue === 'object' && errorValue !== null) {
    const message = (errorValue as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim() !== '') {
      return message.trim();
    }
  }
  return getErrText(errorValue, 'Upstream returned an error payload');
};

/**
 * 在上游适配边界对非流式补全响应执行 Zod Schema 契约校验：
 * 拒绝 HTTP 200 返回错误对象、空 choices 或缺失 message 业务字段的非法载荷。
 */
const validateNonStreamCompletionResponse = (
  payload: unknown
): { ok: true; response: UnStreamResponseType } | { ok: false; message: string } => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, message: 'Upstream returned invalid JSON completion payload' };
  }
  const protocolError = extractUpstreamPayloadError(payload);
  if (protocolError) {
    return { ok: false, message: protocolError };
  }
  const parsed = InvokeUpstreamChatCompletionSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message || 'Upstream completion response failed schema validation'
    };
  }
  return { ok: true, response: parsed.data as unknown as UnStreamResponseType };
};

/**
 * 在上游适配边界对单帧 SSE Chunk 执行 Zod Schema 契约校验。
 */
const validateStreamChunkPayload = (
  payload: unknown
): { ok: true; chunk: ChatCompletionChunk } | { ok: false; message: string } => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, message: 'Upstream stream emitted invalid chunk payload' };
  }
  const protocolError = extractUpstreamPayloadError(payload);
  if (protocolError) {
    return { ok: false, message: protocolError };
  }
  const parsed = InvokeUpstreamChatCompletionChunkSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message || 'Upstream stream chunk failed schema validation'
    };
  }
  return { ok: true, chunk: parsed.data as unknown as ChatCompletionChunk };
};

/**
 * 将非流式响应兜底转换为单个 OpenAI SSE 内容帧（不含 usage）。
 * 独立用量尾帧由统一的流输出逻辑按 `stream_options.include_usage` 决定是否在 `[DONE]` 前追加。
 */
const buildFallbackContentChunkFromCompletion = (
  completion: UnStreamResponseType
): ChatCompletionChunk => ({
  id: completion.id,
  object: 'chat.completion.chunk',
  created: completion.created,
  model: completion.model,
  system_fingerprint: completion.system_fingerprint,
  choices: (completion.choices ?? []).map((choice, idx) => ({
    index: choice.index ?? idx,
    delta: {
      role: 'assistant',
      content: choice.message?.content ?? null,
      ...(choice.message &&
      'reasoning_content' in choice.message &&
      typeof choice.message.reasoning_content === 'string'
        ? { reasoning_content: choice.message.reasoning_content }
        : {}),
      ...(choice.message?.refusal ? { refusal: choice.message.refusal } : {}),
      ...(choice.message?.tool_calls?.length
        ? {
            tool_calls: choice.message.tool_calls
              .filter((toolCall) => toolCall.type === 'function')
              .map((toolCall, toolIdx) => ({
                index: toolIdx,
                id: toolCall.id,
                type: 'function' as const,
                function: {
                  name: toolCall.function.name,
                  arguments: toolCall.function.arguments
                }
              }))
          }
        : {})
    },
    logprobs: choice.logprobs ?? null,
    finish_reason: choice.finish_reason ?? null
  }))
});

/**
 * 构造符合 OpenAI 约定的独立空 `choices` 用量尾帧，确保原生 SSE 与 JSON 兜底路径的帧结构一致。
 */
const buildUsageOnlyChunk = ({
  id,
  created,
  model,
  system_fingerprint,
  usage
}: {
  id?: string;
  created?: number;
  model?: string;
  system_fingerprint?: string | null;
  usage: CompletionUsage;
}): ChatCompletionChunk => ({
  id: id ?? '',
  object: 'chat.completion.chunk',
  created: created ?? Math.floor(Date.now() / 1000),
  model: model ?? '',
  ...(typeof system_fingerprint === 'string' ? { system_fingerprint } : {}),
  choices: [],
  usage
});

/**
 * 插件反向模型调用接口：`POST /api/invoke/llm/chat/completions`
 * 完整兼容官方 OpenAI SDK 非流式 JSON 与流式 SSE 契约，并强制执行 invokeToken 权限与团队模型可用性双重校验。
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  // 1. 校验 HTTP 方法。
  if (req.method !== 'POST') {
    sendOpenAIError(res, {
      status: 405,
      message: 'Method not allowed',
      type: 'invalid_request_error',
      code: 'method_not_allowed'
    });
    return;
  }

  // 2. 解密 Bearer invokeToken 并校验 model:invoke 权限（第二道防线）。
  const token = extractBearerToken(req.headers.authorization);
  if (token === '') {
    sendOpenAIError(res, {
      status: 401,
      message: 'Missing or invalid Authorization Bearer token',
      type: 'authentication_error',
      code: 'invalid_api_key'
    });
    return;
  }

  const processor = (() => {
    try {
      return InvokeProcessor.getInstanceFromToken(token);
    } catch {
      return undefined;
    }
  })();
  if (!processor) {
    sendOpenAIError(res, {
      status: 401,
      message: 'Invalid or expired invoke token',
      type: 'authentication_error',
      code: 'invalid_api_key'
    });
    return;
  }

  const session = (() => {
    try {
      return processor.getModelInvokeSession();
    } catch {
      return undefined;
    }
  })();
  if (!session) {
    sendOpenAIError(res, {
      status: 403,
      message: 'Missing model:invoke permission',
      type: 'permission_error',
      code: 'insufficient_permissions'
    });
    return;
  }

  // 3. 使用 parseApiInput 校验请求体参数；校验失败时返回 OpenAI 兼容 400 错误结构。
  const parsedInput = (() => {
    try {
      return {
        ok: true as const,
        ...parseApiInput({
          req,
          bodySchema: InvokeChatCompletionsBodySchema
        })
      };
    } catch (error) {
      if (error instanceof ApiRequestInputParseError) {
        return {
          ok: false as const,
          message: error.message
        };
      }
      throw error;
    }
  })();
  if (!parsedInput.ok) {
    sendOpenAIError(res, {
      status: 400,
      message: parsedInput.message || 'Invalid chat completion request body',
      type: 'invalid_request_error',
      code: 'invalid_request_error'
    });
    return;
  }
  const { body } = parsedInput;

  // 4. 基于 session 严格校验 modelId 可用性、启用状态与模型使用权限，绝不回退默认模型（第三道防线）。
  const modelResolution = await resolveAuthorizedTeamLLMModel({
    teamId: session.teamId,
    tmbId: session.tmbId,
    isRoot: session.isRoot,
    authorizedModelIds: session.authorizedModelIds,
    modelId: body.model
  });
  if (!modelResolution.ok) {
    sendOpenAIError(res, modelResolution.error);
    return;
  }
  const { modelData } = modelResolution;

  // 4.5 校验团队剩余 AI 积分额度，防止积分耗尽后仍通过插件反向调用持续消费模型。
  try {
    await checkTeamAIPoints(session.teamId);
  } catch (error) {
    if (error === TeamErrEnum.aiPointsNotEnough) {
      sendOpenAIError(res, {
        status: 402,
        message: 'Team AI points are not enough',
        type: 'insufficient_quota',
        code: 'insufficient_quota'
      });
      return;
    }
    sendOpenAIError(res, {
      status: 500,
      message: getErrText(error, 'Failed to check team AI points'),
      type: 'upstream_error',
      code: 'internal_error'
    });
    return;
  }

  // 5. 格式化模型请求体（重写为真实上游 modelData.model 并裁剪不支持参数）。
  const isStream = body.stream === true;
  const callerRequestedUsage = body.stream_options?.include_usage === true;
  const formattedResult = await (async () => {
    try {
      const requestBody = await formatInvokeCompletionRequestBody({
        body,
        modelData,
        isStream
      });
      return { ok: true as const, requestBody };
    } catch (error) {
      return {
        ok: false as const,
        error: {
          status: 400,
          message: getErrText(error, 'Invalid chat completion parameters'),
          type: 'invalid_request_error' as const,
          code: 'invalid_request_error'
        }
      };
    }
  })();
  if (!formattedResult.ok) {
    sendOpenAIError(res, formattedResult.error);
    return;
  }
  const { requestBody } = formattedResult;

  // 6. 绑定客户端断连信号，确保客户端提前断开时立即取消上游模型请求与流读取。
  const abortController = new AbortController();
  const isResponseClosed = () =>
    Boolean(res.writableEnded || res.writableFinished || res.destroyed);
  const triggerAbort = () => {
    if (!res.writableEnded && !res.writableFinished && !abortController.signal.aborted) {
      abortController.abort();
    }
  };
  const handleReqClose = () => {
    // Node.js IncomingMessage 在正常读完请求体（req.complete === true 且未 aborted）时也会触发 close；
    // 仅在请求未完成、已标记 aborted 或测试桩对象触发 close 时中止上游调用。
    if (req.aborted || req.complete !== true) {
      triggerAbort();
    }
  };

  req.on?.('aborted', triggerAbort);
  req.on?.('close', handleReqClose);
  res.on?.('close', triggerAbort);

  const lang = getLocale(req);
  let usageSettled = false;
  const settleOnce = async (
    context: Omit<
      InvokeChatCompletionUsageContext,
      'processor' | 'session' | 'modelData' | 'requestBody' | 'lang'
    >
  ) => {
    if (usageSettled) return;
    usageSettled = true;
    await settleInvokeModelUsage({
      processor,
      session,
      modelData,
      requestBody,
      lang,
      ...context
    }).catch((error) => {
      logger.error('Failed to settle invoke model usage', { error });
    });
  };

  try {
    const completionResult = await createChatCompletion({
      modelData,
      body: requestBody,
      options: {
        signal: abortController.signal
      }
    });

    // 7A. 非流式模式：直接写回原生 OpenAI ChatCompletion JSON（不包装 { code, data }）。
    if (!isStream) {
      if (completionResult.isStreamResponse) {
        completionResult.response.controller?.abort();
        sendOpenAIError(res, {
          status: 502,
          message: 'Unexpected streaming response for non-streaming request',
          type: 'upstream_error',
          code: 'invalid_upstream_response'
        });
        return;
      }

      const validatedResponse = validateNonStreamCompletionResponse(completionResult.response);
      if (!validatedResponse.ok) {
        sendOpenAIError(res, {
          status: 502,
          message: validatedResponse.message,
          type: 'upstream_error',
          code: 'invalid_upstream_response'
        });
        return;
      }

      await settleOnce({
        usage: validatedResponse.response.usage,
        streamAccumulated: extractAccumulatedFromCompletion(validatedResponse.response),
        usedUserOpenAIKey: completionResult.requestMeta.usedUserOpenAIKey,
        aborted: abortController.signal.aborted
      });

      if (!isResponseClosed()) {
        res.status(200).json(validatedResponse.response);
      }
      return;
    }

    // 流式兜底若收到非流式 JSON，在发出 SSE 响应头前先完成协议校验，避免非法 200 错误体进入 SSE。
    const validatedFallbackResponse = !completionResult.isStreamResponse
      ? validateNonStreamCompletionResponse(completionResult.response)
      : undefined;
    if (validatedFallbackResponse && !validatedFallbackResponse.ok) {
      sendOpenAIError(res, {
        status: 502,
        message: validatedFallbackResponse.message,
        type: 'upstream_error',
        code: 'invalid_upstream_response'
      });
      return;
    }

    // 7B. 流式模式：写入标准 text/event-stream SSE 响应头并逐帧转发 ChatCompletionChunk。
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let latestUsage: CompletionUsage | undefined;
    let hasValidStreamPayload = false;
    let emittedUsageOnlyChunk = false;
    let lastChunkMeta: {
      id?: string;
      created?: number;
      model?: string;
      system_fingerprint?: string | null;
    } = { model: modelData.model };
    const streamAccumulated = {
      answerText: '',
      reasoningText: '',
      toolCallArguments: ''
    };

    const writeSseChunk = (chunk: ChatCompletionChunk) => {
      if (!isResponseClosed()) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    };

    // 统一结束流输出：按客户端是否开启 include_usage 决定是否在 [DONE] 前追加独立空 choices 用量尾帧。
    const finishSseStream = () => {
      if (abortController.signal.aborted || isResponseClosed()) {
        return;
      }
      if (callerRequestedUsage && latestUsage && !emittedUsageOnlyChunk) {
        writeSseChunk(
          buildUsageOnlyChunk({
            ...lastChunkMeta,
            usage: latestUsage
          })
        );
        emittedUsageOnlyChunk = true;
      }
      if (!isResponseClosed()) {
        res.write('data: [DONE]\n\n');
      }
    };

    try {
      if (validatedFallbackResponse?.ok) {
        hasValidStreamPayload = true;
        latestUsage = validatedFallbackResponse.response.usage;
        lastChunkMeta = {
          id: validatedFallbackResponse.response.id,
          created: validatedFallbackResponse.response.created,
          model: validatedFallbackResponse.response.model,
          system_fingerprint: validatedFallbackResponse.response.system_fingerprint
        };
        const fallbackAccumulated = extractAccumulatedFromCompletion(
          validatedFallbackResponse.response
        );
        streamAccumulated.answerText = fallbackAccumulated.answerText;
        streamAccumulated.reasoningText = fallbackAccumulated.reasoningText;
        streamAccumulated.toolCallArguments = fallbackAccumulated.toolCallArguments;
        writeSseChunk(buildFallbackContentChunkFromCompletion(validatedFallbackResponse.response));
        finishSseStream();
      } else if (completionResult.isStreamResponse) {
        for await (const rawChunk of completionResult.response) {
          if (abortController.signal.aborted || isResponseClosed()) {
            completionResult.response.controller?.abort();
            break;
          }

          const validatedChunk = validateStreamChunkPayload(rawChunk);
          if (!validatedChunk.ok) {
            throw new Error(validatedChunk.message);
          }
          const chunk = validatedChunk.chunk;

          hasValidStreamPayload = true;
          lastChunkMeta = {
            id: chunk.id ?? lastChunkMeta.id,
            created: chunk.created ?? lastChunkMeta.created,
            model: chunk.model ?? lastChunkMeta.model,
            system_fingerprint:
              chunk.system_fingerprint !== undefined
                ? chunk.system_fingerprint
                : lastChunkMeta.system_fingerprint
          };
          if (chunk.usage) {
            latestUsage = chunk.usage;
          }

          const delta = chunk.choices?.[0]?.delta as
            | (ChatCompletionChunk.Choice.Delta & { reasoning_content?: string })
            | undefined;
          if (typeof delta?.content === 'string') {
            streamAccumulated.answerText += delta.content;
          }
          if (typeof delta?.reasoning_content === 'string') {
            streamAccumulated.reasoningText += delta.reasoning_content;
          }
          if (delta?.tool_calls?.length) {
            for (const toolCall of delta.tool_calls) {
              if (typeof toolCall.function?.arguments === 'string') {
                streamAccumulated.toolCallArguments += toolCall.function.arguments;
              }
            }
          }

          const isUsageOnlyChunk = (chunk.choices?.length ?? 0) === 0 && Boolean(chunk.usage);
          if (isUsageOnlyChunk) {
            if (!callerRequestedUsage) {
              continue;
            }
            writeSseChunk(chunk);
            emittedUsageOnlyChunk = true;
            continue;
          }

          // 内容帧统一剥离内嵌 usage，确保所有流响应只在独立尾帧输出 usage。
          if ('usage' in chunk && chunk.usage !== undefined) {
            const { usage: _omittedUsage, ...chunkWithoutUsage } = chunk;
            writeSseChunk(chunkWithoutUsage);
            continue;
          }

          writeSseChunk(chunk);
        }

        finishSseStream();
      }
    } catch (streamError) {
      if (completionResult.isStreamResponse) {
        completionResult.response.controller?.abort();
      }
      if (!abortController.signal.aborted && !isResponseClosed()) {
        logger.error('Invoke chat completion stream interrupted', { error: streamError });
        const errPayload: InvokeOpenAIErrorResponseType = {
          error: {
            message: getErrText(streamError, 'Upstream stream interrupted'),
            type: 'upstream_error',
            code: 'stream_error'
          }
        };
        res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
      }
    } finally {
      if (hasValidStreamPayload || latestUsage !== undefined) {
        await settleOnce({
          usage: latestUsage,
          streamAccumulated,
          usedUserOpenAIKey: completionResult.requestMeta.usedUserOpenAIKey,
          aborted: abortController.signal.aborted
        });
      }

      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
  } catch (error) {
    if (abortController.signal.aborted || isResponseClosed()) {
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
      return;
    }

    if (!res.headersSent) {
      sendOpenAIError(res, mapUpstreamErrorToOpenAIError(error));
      return;
    }

    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  } finally {
    req.off?.('aborted', triggerAbort);
    req.off?.('close', handleReqClose);
    res.off?.('close', triggerAbort);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: false
  }
};
