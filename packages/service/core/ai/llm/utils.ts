import pLimit from 'p-limit';
import {
  countGptMessagesTokens,
  countGptMessagesTokensBatch
} from '../../../common/string/tiktoken/index';
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionContentPart,
  ChatCompletionContentPartRefusal,
  ChatCompletionContentPartText,
  ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/llm/type';
import {
  parseInlineImageDataUri,
  providerImageMimeTypes
} from '@fastgpt/global/common/file/image/utils';
import { audioFileType, maxToolImagePartAmount } from '@fastgpt/global/common/file/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { axios } from '../../../common/api/axios';

import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getImageBase64 } from '../../../common/file/image/utils';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import {
  parseFileExtensionFromUrl,
  parseFilenameExtension
} from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../../common/logger';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/runtime';
import { getMultipleDataToBase64 } from '../../../common/system/constants';
import {
  classifyUrlMediaType,
  createFileClassificationContext,
  type FileClassificationContext,
  type FileClassificationMediaType
} from '../../../common/file/classification';
import {
  ACTIVE_PLAN_END_TAG,
  ACTIVE_PLAN_START_TAG,
  CONTEXT_CHECKPOINT_END_TAG,
  CONTEXT_CHECKPOINT_START_TAG
} from './compress/constants';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

/**
 * 判断 URL 是否为沙箱文件预览地址。
 *
 * 预览地址带一次性 session 凭证且只在服务端网络拓扑内可达，不适合直接透传给模型服务商。
 * 这里按 env 里的代理前缀识别（与 sandbox 层 buildSandboxPreviewFileUrl 的 `/preview/` 契约一致），
 * 避免把 sandbox 模块及其 dal/redis 依赖拖进 llm 模块。
 */
export const isSandboxPreviewFileUrl = (url: string) => {
  const base = getSystemInstanceConfig().subservice.agentSandbox.proxy.previewUrl;
  if (!base) return false;

  try {
    // 与 sandbox 层 buildSandboxPreviewFileUrl 的 URL 规范化保持一致：host 小写、去掉默认端口，
    // 并清掉 base 自身可能带的 query/hash，否则生成的预览地址认不出来。
    const parsedBase = new URL(base);
    parsedBase.search = '';
    parsedBase.hash = '';
    const normalizedBase = parsedBase.toString().replace(/\/+$/, '');
    return url.startsWith(`${normalizedBase}/preview/`);
  } catch {
    return false;
  }
};

/**
 * 图片占位文本里的 URL 可能是带凭证的预览地址，写入提示词前先脱敏，
 * 避免凭证经纯文本路径外发给模型服务商。
 */
export const maskImagePlaceholderUrl = (url: string) =>
  isSandboxPreviewFileUrl(url) ? 'sandbox preview file' : url;

/**
 * 媒体归一化失败日志只记录可观测的分类、HTTP 状态与错误码/错误名。
 * 上传链接和预览链接可能带签名或一次性凭证，错误原文也可能回显 URL，
 * 因此既不记录原始地址，也不记录 `getErrText` 的完整文本。
 */
const getMediaNormalizationErrorLog = (mediaType: 'image' | 'audio' | 'video', error: unknown) => {
  const err = error as {
    name?: string;
    code?: string | number;
    status?: number;
    response?: { status?: number };
  };
  return {
    mediaType,
    status: err?.response?.status ?? err?.status,
    code: err?.code,
    errorName: err?.name
  };
};

/** 单条用户消息在归一化过程中的媒体丢弃计数，用于区分「部分失败」与「无可消费输入」。 */
type MediaNormalizationState = {
  droppedPartCount: number;
};

/** 工具图片下载超时上限（ms），避免单张慢图长时间阻塞 Agent 推理轮次。 */
export const TOOL_IMAGE_DOWNLOAD_TIMEOUT_MS = 15 * 1000;
const TOOL_IMAGE_DOWNLOAD_CONCURRENCY = 4;

type ToolImageDownloadCache = {
  entries: Map<string, Promise<string | undefined>>;
  limit: ReturnType<typeof pLimit>;
};

// 缓存随单次请求或 Agent 运行的 fileContext 回收，不跨会话共享。
const toolImageDownloadCaches = new WeakMap<FileClassificationContext, ToolImageDownloadCache>();

const getToolImageDownloadCache = (
  fileContext: FileClassificationContext
): ToolImageDownloadCache => {
  const existing = toolImageDownloadCaches.get(fileContext);
  if (existing) return existing;

  const created: ToolImageDownloadCache = {
    entries: new Map(),
    limit: pLimit(TOOL_IMAGE_DOWNLOAD_CONCURRENCY)
  };
  toolImageDownloadCaches.set(fileContext, created);
  return created;
};

/**
 * 按来源选择图片下载通道（用户消息路径）。
 *
 * 沙箱预览代理可能部署在内网，公共 SSRF 内网拦截会把配置里的合法预览地址一起拒掉，
 * 导致工具图片全部丢失。这类地址的 origin 来自服务端配置而不是用户输入，因此只对
 * 该 origin 使用受限通道；其它地址继续走安全的公共下载逻辑。
 */
export const loadImageBase64 = (url: string) => {
  const previewProxyBase = getSystemInstanceConfig().subservice.agentSandbox.proxy.previewUrl;
  if (!previewProxyBase || !isSandboxPreviewFileUrl(url)) {
    return getImageBase64(url);
  }

  return getImageBase64(url, { trustedOrigin: previewProxyBase });
};

/**
 * 工具视觉通道专用图片下载入口（fastAgent 与 piAgent 共用）。
 *
 * 工具返回的外链可能返回 200 text/html 登录页或慢响应：这里开启魔数白名单校验与短超时，
 * 防止把非图像字节包装成无效 data:image/... 发给上游视觉模型，同时保留通用下载器的兼容语义。
 */
export const loadToolImageBase64 = (url: string, options?: { timeoutMs?: number }) => {
  const previewProxyBase = getSystemInstanceConfig().subservice.agentSandbox.proxy.previewUrl;
  const isSandboxPreview = Boolean(previewProxyBase && isSandboxPreviewFileUrl(url));

  return getImageBase64(url, {
    ...(isSandboxPreview ? { trustedOrigin: previewProxyBase } : {}),
    timeoutMs: options?.timeoutMs ?? TOOL_IMAGE_DOWNLOAD_TIMEOUT_MS,
    allowedMimeTypes: providerImageMimeTypes
  });
};

/**
 * 判断消息是否属于系统级提示。
 * 这类消息不参与普通会话窗口裁剪，避免 system/developer 指令被上下文截断。
 */
const isSystemLikeMessage = (message: ChatCompletionMessageParam) =>
  message.role === ChatCompletionRequestMessageRoleEnum.System ||
  message.role === ChatCompletionRequestMessageRoleEnum.Developer;

/**
 * 判断消息是否是上下文压缩检查点。
 * 检查点代表已压缩的历史前缀，需要跟系统提示一起保留。
 */
const isContextCheckpointMessage = (message: ChatCompletionMessageParam) => {
  if (
    message.role !== ChatCompletionRequestMessageRoleEnum.User ||
    message.hideInUI !== true ||
    typeof message.content !== 'string'
  ) {
    return false;
  }

  const content = message.content.trim();
  const startsWithCheckpoint = content.startsWith(CONTEXT_CHECKPOINT_START_TAG);
  const startsWithActivePlan = content.startsWith(ACTIVE_PLAN_START_TAG);
  const activePlanEndIndex = content.indexOf(ACTIVE_PLAN_END_TAG);
  const checkpointStartIndex = content.indexOf(CONTEXT_CHECKPOINT_START_TAG);

  return (
    content.endsWith(CONTEXT_CHECKPOINT_END_TAG) &&
    (startsWithCheckpoint ||
      (startsWithActivePlan &&
        activePlanEndIndex > ACTIVE_PLAN_START_TAG.length &&
        checkpointStartIndex > activePlanEndIndex))
  );
};

/**
 * 按最大上下文长度裁剪消息。
 * 系统提示和上下文检查点始终保留，普通对话按完整 user 轮次从新到旧保留。
 */
export const filterGPTMessageByMaxContext = async ({
  messages = [],
  maxContext
}: {
  messages: ChatCompletionMessageParam[];
  maxContext: number;
}) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  // Keep leading system/developer prompts out of the rolling chat window.
  const chatStartIndex = messages.findIndex((item) => !isSystemLikeMessage(item));

  if (chatStartIndex === -1) {
    return messages;
  }

  const systemPrompts: ChatCompletionMessageParam[] = messages.slice(0, chatStartIndex);
  const chatPrompts: ChatCompletionMessageParam[] = messages.slice(chatStartIndex);
  const leadingContextCheckpoints: ChatCompletionMessageParam[] = [];

  // A checkpoint is the compacted prefix; treating it like normal chat would drop it first.
  while (chatPrompts.length > 0 && isContextCheckpointMessage(chatPrompts[0])) {
    leadingContextCheckpoints.push(chatPrompts.shift()!);
  }

  if (chatPrompts.length === 0) {
    return [...systemPrompts, ...leadingContextCheckpoints];
  }

  // reduce token of systemPrompt
  maxContext -= await countGptMessagesTokens({
    messages: [...systemPrompts, ...leadingContextCheckpoints]
  });

  /* 截取时候保证一轮内容的完整性
    1. user - assistant - user
    2. user - assistant - tool
    3. user - assistant - tool - tool - tool
    3. user - assistant - tool - assistant - tool
    4. user - assistant - assistant - tool - tool
  */
  const messageGroups: ChatCompletionMessageParam[][] = [];
  let tmpChats: ChatCompletionMessageParam[] = [];

  // 从后往前分组，每次到 user 则认为是一组完整信息；后续批量统计可减少 worker 往返。
  while (chatPrompts.length > 0) {
    const lastMessage = chatPrompts.pop();
    if (!lastMessage) {
      break;
    }

    // 遇到 user，说明到了一轮完整信息，可以开始判断是否需要保留
    if (lastMessage.role === ChatCompletionRequestMessageRoleEnum.User) {
      messageGroups.unshift([lastMessage, ...tmpChats]);
      tmpChats = [];
    } else {
      tmpChats.unshift(lastMessage);
    }
  }

  const reversedMessageGroups = [...messageGroups].reverse();
  const groupTokens = (await countGptMessagesTokensBatch(reversedMessageGroups)).reverse();
  const chats: ChatCompletionMessageParam[] = [];

  for (let i = messageGroups.length - 1; i >= 0; i--) {
    maxContext -= groupTokens[i] || 0;
    // 该轮信息整体 tokens 超出范围，这段数据不要了。但是至少保证一组。
    if (maxContext < 0 && chats.length > 0) {
      break;
    }

    chats.unshift(...messageGroups[i]);
  }

  return [...systemPrompts, ...leadingContextCheckpoints, ...chats];
};

/**
 * 格式化发给模型供应商的消息。
 * 这里会按模型能力过滤用户多模态输入，剥离 FastGPT 内部字段，并把内部媒体协议转成供应商可消费的 content part。
 */
export const loadRequestMessages = async ({
  messages,
  useVision = false,
  useAudio = false,
  useVideo = false,
  extractFiles,
  fileContext = createFileClassificationContext(),
  supportReason = false
}: {
  messages: ChatCompletionMessageParam[];
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  extractFiles?: boolean;
  /** 在一次请求或 Agent 运行内复用分类和降级结果，不跨请求共享。 */
  fileContext?: FileClassificationContext;
  supportReason?: boolean;
}) => {
  /**
   * 从 URL 下载二进制内容并转成 data URL。
   * 用于供应商不能访问内部文件或模型配置要求 base64 的媒体输入。
   */
  const loadUrlAsBase64Data = async (url: string) => {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    return `data:;base64,${Buffer.from(response.data).toString('base64')}`;
  };

  /**
   * 规范化 system/developer 消息内容。
   * 数组内容只保留文本段，避免把多模态 part 误带入系统提示。
   */
  const parseSystemMessage = (
    content: string | ChatCompletionContentPartText[]
  ): string | ChatCompletionContentPartText[] | undefined => {
    if (typeof content === 'string') {
      if (!content) return;
      return content;
    }

    const arrayContent = content
      .filter((item) => item.text)
      .map((item) => item.text)
      .join('\n\n');

    return arrayContent;
  };

  /**
   * 创建图片 content part。
   * 图片协议当前只需要 URL，内部文件转 base64 的动作由后续归一化阶段处理。
   */
  const createImageContentPart = (
    url: string
  ): Extract<ChatCompletionContentPart, { type: 'image_url' }> => ({
    type: 'image_url',
    image_url: {
      url
    }
  });

  /**
   * 已识别为音频的输入始终生成 input_audio。
   * OpenAI input_audio 协议要求显式提供 format（如 mp3/wav），而 image_url/video_url 仅需 url；
   * 优先从探测出的真实文件名提取后缀，否则回退到 URL 后缀，未知格式时省略。
   */
  const createAudioContentPart = (
    data: string,
    filename?: string
  ): Extract<ChatCompletionContentPart, { type: 'input_audio' }> => {
    const format = parseFilenameExtension(filename) || parseFileExtensionFromUrl(data);
    const isSupportedAudioFormat =
      !!format && audioFileType.split(',').some((item) => item.trim() === `.${format}`);

    return {
      type: 'input_audio',
      input_audio: {
        data,
        ...(isSupportedAudioFormat ? { format } : {})
      }
    };
  };

  /**
   * 创建视频 content part。
   * 视频协议目前只保留 URL，是否需要 base64 由归一化阶段统一判断。
   */
  const createVideoContentPart = (
    url: string
  ): Extract<ChatCompletionContentPart, { type: 'video_url' }> => ({
    type: 'video_url',
    video_url: {
      url
    }
  });

  /**
   * 判断媒体是否需要在服务端转 base64。
   * 本地路径只有服务端能读取；multipleDataToBase64 用于兼容不支持远程 URL 的模型。
   * 开关在本次请求入口只取一次：若逐条媒体求值，管理员中途保存配置会触发快照
   * 重载，导致同一次请求部分图片转 base64、部分保留远程 URL 的混合形态。
   */
  const multipleDataToBase64 = getMultipleDataToBase64();
  const shouldLoadMediaAsBase64 = (url: string) => {
    return url.startsWith('/') || multipleDataToBase64;
  };

  /**
   * 剥离系统自动注入的 <system-reminder> 块，仅对用户原始输入做长度判断与链接提取。
   * 避免挂载技能、知识库或对话文件后 reminder 长度超过 500 字符导致提取失效，或误提取 reminder 内的链接。
   */
  const stripSystemReminder = (input: string) =>
    input.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, '');

  /**
   * 从短文本中提取候选 HTTP(S) 链接并做尾部标点与 Markdown 语法清洗。
   * 具体是否为媒体文件交由统一分类入口 classifyUrlMediaType 判断，支持无后缀短链探测。
   */
  const extractCandidateUrls = (input: string) => {
    const urlRegex = /(https?:\/\/[^\s<>"'\\]+)/gi;
    const normalizeExtractedUrl = (rawUrl: string) => {
      // Markdown 链接里的 URL 可能同时出现在 label 和 href 中，避免把 `](...)` 当成 URL 的一部分。
      const markdownLinkSeparatorIndex = rawUrl.indexOf('](');
      const urlWithoutMarkdownTail =
        markdownLinkSeparatorIndex === -1 ? rawUrl : rawUrl.slice(0, markdownLinkSeparatorIndex);

      return urlWithoutMarkdownTail.replace(/[)\]\}，。,.!?;:]+$/, '');
    };

    const normalizedUrls = Array.from(input.matchAll(urlRegex), (m) => normalizeExtractedUrl(m[0]));

    return Array.from(new Set(normalizedUrls));
  };

  /**
   * 根据统一链接分类结果与当前模型能力把文本里的媒体 URL 转成 content part。
   * 支持无显式后缀的下载短链按元数据/响应探测识别；普通文档 URL 或未开启对应多模态能力时返回 undefined。
   */
  const createMediaContentPartFromUrl = async (
    url: string
  ): Promise<ChatCompletionContentPart | undefined> => {
    const parsed = await classifyUrlMediaType({ url, fileContext });
    if (!parsed) return;

    if (parsed.type === 'image' && useVision) {
      return createImageContentPart(url);
    }

    if (parsed.type === 'audio' && useAudio) {
      return createAudioContentPart(url, parsed.filename);
    }

    if (parsed.type === 'video' && useVideo) {
      return createVideoContentPart(url);
    }
  };

  /**
   * 从短文本里提取可由当前模型能力消费的媒体 URL，同时保留原始文本。
   * 计数和提取前先剥离 <system-reminder>，长文本不做 URL 拆分，避免把普通上下文里的链接误判成模型输入文件。
   */
  const parseTextUserContentParts = async (input: string): Promise<ChatCompletionContentPart[]> => {
    const shouldExtractFiles = extractFiles ?? useVision;
    const userText = stripSystemReminder(input);
    if (!shouldExtractFiles || (!useVision && !useAudio && !useVideo) || userText.length >= 500) {
      return [{ type: 'text', text: input }];
    }

    const candidateUrls = extractCandidateUrls(userText);
    if (candidateUrls.length === 0) {
      return [{ type: 'text', text: input }];
    }

    const mediaParts = (
      await Promise.all(candidateUrls.map((url) => createMediaContentPartFromUrl(url)))
    ).filter((part): part is ChatCompletionContentPart => part !== undefined);

    // Too many media files return text
    if (mediaParts.length > 4) {
      return [{ type: 'text', text: input }];
    }

    return [...mediaParts, { type: 'text', text: input }];
  };

  const toolImageCache = getToolImageDownloadCache(fileContext);

  /** 规范化已内联的 data URI 图片 part；非 data URI 返回 undefined 交由后续下载逻辑处理。 */
  const normalizeInlineImageDataPart = (
    imageItem: Omit<Extract<ChatCompletionContentPart, { type: 'image_url' }>, 'key'>
  ): ChatCompletionContentPart | undefined => {
    const imgUrl = imageItem.image_url.url;
    const inlineImage = parseInlineImageDataUri(imgUrl);
    if (inlineImage) {
      return {
        ...imageItem,
        image_url: {
          ...imageItem.image_url,
          url: `data:${inlineImage.mimeType};base64,${inlineImage.data}`
        }
      };
    }

    if (/^data:image\//i.test(imgUrl)) {
      return imageItem;
    }

    return undefined;
  };

  /**
   * 在当前 fileContext 生命周期内按「工具调用结果 + URL」复用下载结果并限制并发度与总等待时间。
   * - 同一历史工具结果（相同 toolCallId + URL）在后续轮次直接复用，不再重复 GET；
   * - 不同工具调用即使返回相同的可更新 URL（如新版本图表或重试恢复），也拥有独立下载机会；
   * - 总截止时间包含并发排队时间，避免多批慢图叠加阻塞模型请求。
   */
  const loadCachedToolImageDataUri = (
    toolCallId: string,
    url: string
  ): Promise<string | undefined> => {
    const cacheKey = `${toolCallId}:${url}`;
    const cached = toolImageCache.entries.get(cacheKey);
    if (cached) return cached;

    const deadline = Date.now() + TOOL_IMAGE_DOWNLOAD_TIMEOUT_MS;
    const pending = toolImageCache.limit(async () => {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        logger.warn('Drop tool image part after queue wait timeout', {
          toolCallId,
          url
        });
        return undefined;
      }

      try {
        const { completeBase64 } = await loadToolImageBase64(url, { timeoutMs: remainingMs });
        return completeBase64;
      } catch (error) {
        logger.warn('Drop tool image part after normalization failure', {
          error: getErrText(error)
        });
        return undefined;
      }
    });
    toolImageCache.entries.set(cacheKey, pending);
    return pending;
  };

  /**
   * 归一化图片输入：内部文件或强制配置时转 base64，远程图片直接透传给模型服务。
   * 不在 FastGPT 服务端做 HEAD 可访问性校验，避免多图并发请求引发外部连接耗尽 DoS。
   */
  const normalizeImageContentPart = async (
    item: Extract<ChatCompletionContentPart, { type: 'image_url' }>,
    state?: MediaNormalizationState
  ): Promise<ChatCompletionContentPart | undefined> => {
    const { key: _key, ...imageItem } = item;
    const inlinePart = normalizeInlineImageDataPart(imageItem);
    if (inlinePart) {
      return inlinePart;
    }

    const imgUrl = imageItem.image_url.url;
    if (shouldLoadMediaAsBase64(imgUrl)) {
      try {
        const { completeBase64: base64 } = await loadImageBase64(imgUrl);

        return {
          ...imageItem,
          image_url: {
            ...imageItem.image_url,
            url: base64
          }
        };
      } catch (error) {
        // 内部文件下载偶发失败（签名过期、边缘节点 400 等）不应让整轮请求失败：
        // 丢弃该图片 part，保留其余文本继续请求模型，与工具图片的降级策略保持一致。
        if (state) state.droppedPartCount++;
        logger.warn(
          'Drop image content part after normalization failure',
          getMediaNormalizationErrorLog('image', error)
        );
        return undefined;
      }
    }

    return imageItem;
  };

  /**
   * 归一化音频输入：远程 URL 可直接保留，内部文件或强制 base64 场景转成 data URL。
   */
  const normalizeAudioContentPart = async (
    item: Extract<ChatCompletionContentPart, { type: 'input_audio' }>,
    state?: MediaNormalizationState
  ): Promise<ChatCompletionContentPart | undefined> => {
    const { key: _key, ...audioItem } = item;
    const audioData = audioItem.input_audio.data;
    if (audioData.startsWith('data:')) {
      return audioItem;
    }

    if (!shouldLoadMediaAsBase64(audioData)) {
      return audioItem;
    }

    try {
      const data = await loadUrlAsBase64Data(audioData);
      return {
        ...audioItem,
        input_audio: {
          ...audioItem.input_audio,
          data
        }
      };
    } catch (error) {
      if (state) state.droppedPartCount++;
      logger.warn(
        'Drop audio content part after normalization failure',
        getMediaNormalizationErrorLog('audio', error)
      );
      return undefined;
    }
  };

  /**
   * 归一化视频输入，规则与音频一致。
   * 保留 video_url 结构，避免在这里绑定具体供应商字段。
   */
  const normalizeVideoContentPart = async (
    item: Extract<ChatCompletionContentPart, { type: 'video_url' }>,
    state?: MediaNormalizationState
  ): Promise<ChatCompletionContentPart | undefined> => {
    const { key: _key, ...videoItem } = item;
    const videoUrl = videoItem.video_url.url;
    if (videoUrl.startsWith('data:')) {
      return videoItem;
    }

    if (!shouldLoadMediaAsBase64(videoUrl)) {
      return videoItem;
    }

    try {
      const url = await loadUrlAsBase64Data(videoUrl);
      return {
        ...videoItem,
        video_url: {
          url
        }
      };
    } catch (error) {
      if (state) state.droppedPartCount++;
      logger.warn(
        'Drop video content part after normalization failure',
        getMediaNormalizationErrorLog('video', error)
      );
      return undefined;
    }
  };

  /**
   * 将 FastGPT 内部 file_url 按统一分类规则转成模型可消费的多模态 content part。
   * 普通文档文件不会进入 LLM 多模态消息，文档内容由上游读取后以文本提供。
   */
  const normalizeFileUrlContentPart = async (
    item: Extract<ChatCompletionContentPart, { type: 'file_url' }>,
    state?: MediaNormalizationState
  ): Promise<ChatCompletionContentPart | undefined> => {
    const { key: _key, ...fileItem } = item;
    if (!useVision && !useAudio && !useVideo) return;

    const parsed = await classifyUrlMediaType({
      url: fileItem.url,
      name: fileItem.name,
      type: fileItem.fileType as FileClassificationMediaType | undefined,
      fileContext
    });
    if (!parsed) return;

    // 上传文件会先以 FastGPT 内部的 file_url 存在，发给模型前需要转成供应商支持的
    // image_url / input_audio / video_url。文档和无法识别的文件不直接透传给 LLM。
    if (parsed.type === 'image' && useVision) {
      return normalizeImageContentPart(createImageContentPart(fileItem.url), state);
    }

    if (parsed.type === 'audio' && useAudio) {
      return normalizeAudioContentPart(
        createAudioContentPart(fileItem.url, parsed.filename || fileItem.name),
        state
      );
    }

    if (parsed.type === 'video' && useVideo) {
      return normalizeVideoContentPart(createVideoContentPart(fileItem.url), state);
    }
  };

  /**
   * 单个 content part 的协议归一化入口。
   * 文本和已支持的非媒体 part 直接透传，媒体 part 按类型分派处理。
   */
  const normalizeMediaContentPart = async (
    item: ChatCompletionContentPart,
    state?: MediaNormalizationState
  ) => {
    if (item.type === 'image_url') return normalizeImageContentPart(item, state);
    if (item.type === 'input_audio') return normalizeAudioContentPart(item, state);
    if (item.type === 'video_url') return normalizeVideoContentPart(item, state);
    if (item.type === 'file_url') return normalizeFileUrlContentPart(item, state);

    return item;
  };

  /**
   * 将 FastGPT 内部媒体 content part 归一化为供应商可消费的消息格式。
   * 本地路径和强制 base64 开关会在这里统一转换；内部 key 只会被剥离，不参与处理。
   */
  const normalizeMediaContentParts = async (
    content: ChatCompletionContentPart[],
    state?: MediaNormalizationState
  ) => {
    const normalized = await Promise.all(
      content.map((item) => normalizeMediaContentPart(item, state))
    );

    return normalized.filter(Boolean) as ChatCompletionContentPart[];
  };

  /**
   * 工具图片的归一化不阻塞整轮请求。
   *
   * 工具给出的图片可能已经失效（404、超限、被内网策略拒绝）或仅在服务端网络可达（如沙箱预览地址）。
   * 若在 multipleDataToBase64=false 时直接透传外部 URL，上游模型网关拉图失败会直接报错中断工具调用。
   * 因此工具图片统一走服务端内联（forceBase64），失败时静默丢弃并保留 tool 文本，与 piAgent 保持一致。
   */
  const normalizeToolMediaContentParts = async (
    content: ChatCompletionContentPart[],
    toolCallId: string
  ) => {
    const normalized = await Promise.all(
      content.map(async (item) => {
        if (item.type === 'image_url') {
          const { key: _key, ...imageItem } = item;
          const inlinePart = normalizeInlineImageDataPart(imageItem);
          if (inlinePart) {
            return inlinePart;
          }

          const base64 = await loadCachedToolImageDataUri(toolCallId, imageItem.image_url.url);
          if (!base64) return undefined;
          return {
            ...imageItem,
            image_url: {
              ...imageItem.image_url,
              url: base64
            }
          };
        }

        try {
          const [result] = await normalizeMediaContentParts([item]);
          return result;
        } catch (error) {
          logger.warn('Drop tool image part after normalization failure', {
            error: getErrText(error)
          });
          return undefined;
        }
      })
    );

    return normalized.filter(Boolean) as ChatCompletionContentPart[];
  };

  /**
   * 在归一化前按模型能力过滤用户输入。
   * 这里处理的是能力边界，不做 URL/base64 转换，避免过滤和转换逻辑混在一起。
   */
  const filterSupportedUserContentPart = (
    item: ChatCompletionContentPart
  ): ChatCompletionContentPart | undefined => {
    if (item.type === 'text') {
      return item.text ? item : undefined;
    }

    if (item.type === 'file_url') {
      if (item.fileType === 'audio') return useAudio ? item : undefined;
      if (item.fileType === 'video') return useVideo ? item : undefined;
      // unknown、历史 file 与缺省类型继续推测，显式文档不进入供应商多模态通道。
      return item.fileType !== ChatFileTypeEnum.document && (useVision || useAudio || useVideo)
        ? item
        : undefined;
    }

    if (item.type === 'input_audio') {
      return useAudio ? item : undefined;
    }

    if (item.type === 'video_url') {
      return useVideo ? item : undefined;
    }

    if (item.type === 'image_url') {
      if (!useVision || !item.image_url.url) return;
    }

    return item;
  };

  /**
   * 用户消息出站前的统一入口：
   * - string 内容可从短文本提取媒体 URL；
   * - array 内容只做能力过滤，不再额外解析文本 URL；
   * - 最终统一归一化为模型供应商可消费的 content part。
   *
   * 返回值同时带上本条消息的媒体丢弃数：调用方据此区分「部分媒体失败但仍有文本」与
   * 「本轮没有可消费输入」，后者不能再以字符串 `null` 继续请求模型。
   */
  const parseUserContent = async (content: string | ChatCompletionContentPart[]) => {
    const state: MediaNormalizationState = { droppedPartCount: 0 };
    if (content === undefined) return { content: undefined, droppedPartCount: 0 };
    if (typeof content === 'string') {
      if (content === '') return { content: undefined, droppedPartCount: 0 };

      const normalizedContent = await normalizeMediaContentParts(
        await parseTextUserContentParts(content),
        state
      );
      return {
        content: normalizedContent.length === 0 ? undefined : normalizedContent,
        droppedPartCount: state.droppedPartCount
      };
    }

    const supportedContent = content
      .map((item) => filterSupportedUserContentPart(item))
      .filter(Boolean) as ChatCompletionContentPart[];
    const normalizedContent = await normalizeMediaContentParts(supportedContent, state);

    return {
      content: normalizedContent.length === 0 ? undefined : normalizedContent,
      droppedPartCount: state.droppedPartCount
    };
  };

  /**
   * 格式化 assistant 消息的结构字段。
   * reasoning_content 只在模型声明支持时保留，避免传给不支持 reasoning 字段的供应商。
   * 原样保留已有的思考内容和空字符串。
   */
  const formatAssistantItem = (
    item: ChatCompletionAssistantMessageParam & {
      reasoning_content?: string;
    },
    supportReason: boolean
  ) => {
    return {
      role: item.role,
      content: item.content || undefined,
      reasoning_content: supportReason ? item.reasoning_content : undefined,
      function_call: item.function_call || undefined,
      name: item.name || undefined,
      refusal: item.refusal || undefined,
      tool_calls: item.tool_calls || undefined
    };
  };

  /**
   * 提取 assistant 文本内容。
   * refusal 等非文本 part 不参与历史文本拼接，交互节点空内容按空字符串处理。
   */
  const parseAssistantContent = (
    content:
      | string
      | (ChatCompletionContentPartText | ChatCompletionContentPartRefusal)[]
      | null
      | undefined
  ) => {
    if (typeof content === 'string') {
      return content?.trim() || '';
    }
    // 交互节点
    if (!content) return '';

    const result = content.filter((item) => item?.type === 'text');
    if (result.length === 0) return '';

    return result
      .map((item) => item.text)
      .join('\n')
      .trim();
  };

  if (messages.length === 0) {
    return Promise.reject(i18nT('common:core.chat.error.Messages empty'));
  }

  /**
   * 合并相邻同角色消息，减少发送给供应商的消息数量。
   * 单独保留带工具调用的 assistant，合并时写入副本以便 Agent 后续请求复用原始历史。
   */
  const mergeMessages = ((messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] => {
    return messages.reduce((mergedMessages: ChatCompletionMessageParam[], currentMessage) => {
      const lastIndex = mergedMessages.length - 1;
      const lastMessage = mergedMessages[lastIndex];

      if (!lastMessage) {
        return [currentMessage];
      }

      if (
        lastMessage.role === ChatCompletionRequestMessageRoleEnum.System &&
        currentMessage.role === ChatCompletionRequestMessageRoleEnum.System
      ) {
        const lastContent: ChatCompletionContentPartText[] = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : [{ type: 'text', text: lastMessage.content || '' }];
        const currentContent: ChatCompletionContentPartText[] = Array.isArray(
          currentMessage.content
        )
          ? currentMessage.content
          : [{ type: 'text', text: currentMessage.content || '' }];
        mergedMessages[lastIndex] = {
          ...lastMessage,
          content: [...lastContent, ...currentContent]
        };
      } // Handle user messages
      else if (
        lastMessage.role === ChatCompletionRequestMessageRoleEnum.User &&
        currentMessage.role === ChatCompletionRequestMessageRoleEnum.User
      ) {
        const lastContent: ChatCompletionContentPart[] = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : [{ type: 'text', text: lastMessage.content }];
        const currentContent: ChatCompletionContentPart[] = Array.isArray(currentMessage.content)
          ? currentMessage.content
          : [{ type: 'text', text: currentMessage.content }];
        mergedMessages[lastIndex] = {
          ...lastMessage,
          content: [...lastContent, ...currentContent]
        };
      } else if (
        lastMessage.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
        currentMessage.role === ChatCompletionRequestMessageRoleEnum.Assistant
      ) {
        if (
          !lastMessage.tool_calls?.length &&
          !lastMessage.function_call &&
          !currentMessage.tool_calls?.length &&
          !currentMessage.function_call &&
          (typeof lastMessage.content === 'string' ||
            Array.isArray(lastMessage.content) ||
            lastMessage.interactive) &&
          (typeof currentMessage.content === 'string' ||
            Array.isArray(currentMessage.content) ||
            currentMessage.interactive)
        ) {
          const lastContent: (ChatCompletionContentPartText | ChatCompletionContentPartRefusal)[] =
            Array.isArray(lastMessage.content)
              ? lastMessage.content
              : [{ type: 'text', text: lastMessage.content || '' }];
          const currentContent: (
            | ChatCompletionContentPartText
            | ChatCompletionContentPartRefusal
          )[] = Array.isArray(currentMessage.content)
            ? currentMessage.content
            : [{ type: 'text', text: currentMessage.content || '' }];

          mergedMessages[lastIndex] = {
            ...lastMessage,
            content: [...lastContent, ...currentContent],
            reasoning_content:
              lastMessage.reasoning_content === undefined
                ? currentMessage.reasoning_content
                : lastMessage.reasoning_content + (currentMessage.reasoning_content ?? '')
          };
        } else {
          mergedMessages.push(currentMessage);
        }
      } else {
        mergedMessages.push(currentMessage);
      }

      return mergedMessages;
    }, []);
  })(messages);

  /**
   * 工具消息里的图片不能直接放进 tool content（供应商只接受字符串或文本 parts），
   * 需要转换成紧随其后的 user 视觉消息。但同一个 assistant 消息可能同时发起多个工具调用，
   * 这时的图片消息必须排在全部 tool 结果之后，否则会打断 tool_call 结果回填顺序。
   * 这里先给 tool 消息登记图片，拼装阶段再按“整轮 tool 结果”统一追加。
   */
  const toolMediaParts = new WeakMap<ChatCompletionMessageParam, ChatCompletionContentPart[]>();

  /** 拆分工具文本和多模态内容，保留媒体与对应文本的顺序。 */
  const extractToolMediaContent = async (
    content: ChatCompletionContentPart[],
    toolCallId: string
  ) => {
    const supportedContent = content
      .map(filterSupportedUserContentPart)
      .filter((part): part is ChatCompletionContentPart => part !== undefined);
    const textParts = supportedContent.filter(
      (part): part is ChatCompletionContentPartText => part.type === 'text'
    );
    const mediaParts = supportedContent.filter((part) => part.type !== 'text');

    // 多段文本需要随媒体一起发送，才能保留字段值与媒体的对应关系。
    const orderedParts = textParts.length > 1 ? supportedContent : mediaParts;
    // 先按单条工具结果的图片上限截断，再由服务端内联，避免返回大量链接时并发拉图。
    let imageCount = 0;
    const cappedParts = orderedParts.filter(
      (part) => part.type !== 'image_url' || ++imageCount <= maxToolImagePartAmount
    );
    const normalizedMediaParts = await normalizeToolMediaContentParts(cappedParts, toolCallId);

    return { textParts, mediaParts: normalizedMediaParts };
  };

  const loadMessages = (
    await Promise.all(
      mergeMessages.map(async (raw, i) => {
        // 剥离系统内部字段，避免 mutate 调用方传入的 messages
        const item = { ...raw };
        delete item.dataId;
        delete item.hideInUI;

        if (item.role === ChatCompletionRequestMessageRoleEnum.System) {
          const content = parseSystemMessage(item.content);
          if (!content) return;
          return {
            ...item,
            content
          };
        } else if (item.role === ChatCompletionRequestMessageRoleEnum.User) {
          const { content, droppedPartCount } = await parseUserContent(item.content);
          if (!content) {
            // 部分失败（仍有文本或其它可用 part）走上面的继续逻辑；这里只剩「本条消息没有
            // 任何可消费输入」。若是因为媒体全部读取失败，不能再以 'null' 继续发空任务，
            // 而应让本轮以明确的文件读取失败结束。
            if (droppedPartCount > 0) {
              throw new UserError(i18nT('common:core.chat.error.File read failed'));
            }
            return {
              ...item,
              content: 'null'
            };
          }

          const formatContent = (() => {
            if (Array.isArray(content) && content.length === 1 && content[0].type === 'text') {
              return content[0].text;
            }
            return content;
          })();

          return {
            ...item,
            content:
              typeof formatContent === 'string'
                ? formatContent
                : (formatContent as ChatCompletionContentPartText[])
          };
        } else if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
          if (item.tool_calls || item.function_call) {
            return formatAssistantItem(item, supportReason);
          }

          const parseContent = parseAssistantContent(item.content);

          // 如果内容为空，且前后不再是 assistant，需要补充成 null，避免丢失 user-assistant 的交互
          const formatContent = (() => {
            const lastItem = mergeMessages[i - 1];
            const nextItem = mergeMessages[i + 1];
            if (
              parseContent === '' &&
              (lastItem?.role === ChatCompletionRequestMessageRoleEnum.Assistant ||
                nextItem?.role === ChatCompletionRequestMessageRoleEnum.Assistant)
            ) {
              return;
            }
            return parseContent || 'null';
          })();
          if (!formatContent) return;

          return {
            ...formatAssistantItem(item, supportReason),
            content: formatContent
          };
        } else if (item.role === ChatCompletionRequestMessageRoleEnum.Tool) {
          // 供应商接口的 tool content 只接受字符串或文本 parts，图片不能放进 tool 消息。
          // 文本保留在 tool 消息里；图片先按模型能力过滤、再归一化，登记到 toolMediaParts，
          // 由拼装阶段转换成这一轮 tool 结果之后的 user 视觉消息。
          if (!Array.isArray(item.content)) {
            return item;
          }

          const { textParts, mediaParts } = await extractToolMediaContent(
            item.content,
            item.tool_call_id
          );

          const toolMessage = {
            ...item,
            content:
              textParts.length === 0
                ? 'none'
                : textParts.length === 1
                  ? textParts[0].text
                  : textParts
          } as ChatCompletionMessageParam;

          if (mediaParts.some((part) => part.type !== 'text')) {
            toolMediaParts.set(toolMessage, mediaParts);
          }

          return toolMessage;
        } else {
          return item;
        }
      })
    )
  ).filter(Boolean) as ChatCompletionMessageParam[];

  /**
   * 同一轮的全部 tool 结果必须连续回填，工具图片消息统一追加在这一轮 tool 结果之后。
   * 否则 assistant(A,B) 的回填会变成 tool A → user(image) → tool B，打断协议顺序。
   */
  const appendToolMediaAfterToolRun = (messages: ChatCompletionMessageParam[]) => {
    const result: ChatCompletionMessageParam[] = [];
    let pendingToolMedia: ChatCompletionContentPart[] = [];

    const flushToolMedia = () => {
      if (pendingToolMedia.length === 0) return;
      result.push({
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: pendingToolMedia
      } as ChatCompletionMessageParam);
      pendingToolMedia = [];
    };

    messages.forEach((message) => {
      if (message.role === ChatCompletionRequestMessageRoleEnum.Tool) {
        result.push(message);
        const media = toolMediaParts.get(message);
        if (media?.length) {
          pendingToolMedia.push(...media);
        }
        return;
      }

      flushToolMedia();
      result.push(message);
    });
    flushToolMedia();

    return result;
  };

  return appendToolMediaAfterToolRun(loadMessages);
};
