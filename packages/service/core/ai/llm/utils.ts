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
import { audioFileType, imageFileType, videoFileType } from '@fastgpt/global/common/file/constants';
import { axios } from '../../../common/api/axios';

import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getImageBase64 } from '../../../common/file/image/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { serviceEnv } from '../../../env';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

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
const isContextCheckpointMessage = (message: ChatCompletionMessageParam) =>
  message.role === ChatCompletionRequestMessageRoleEnum.User &&
  message.hideInUI === true &&
  typeof message.content === 'string' &&
  message.content.trim().startsWith('<context_checkpoint>') &&
  message.content.trim().endsWith('</context_checkpoint>');

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
  supportReason = false
}: {
  messages: ChatCompletionMessageParam[];
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  extractFiles?: boolean;
  supportReason?: boolean;
}) => {
  type MediaFileType = 'image' | 'audio' | 'video';

  /**
   * 提取文件扩展名并统一成小写。
   * 空文件名或无扩展名时返回空字符串，方便后续类型匹配直接失败。
   */
  const getFileExtension = (filename: string) => filename.split('.').pop()?.toLowerCase() || '';

  /**
   * 判断扩展名是否命中 FastGPT 配置的文件类型白名单。
   * fileTypes 使用逗号分隔的 .ext 列表，这里保持与全局常量格式一致。
   */
  const matchFileType = (fileTypes: string, extension: string) =>
    !!extension && fileTypes.split(',').some((item) => item.trim() === `.${extension}`);

  /**
   * 从可访问 URL 中恢复文件名，用于判断音频格式。
   * S3 签名链接可能把原始文件名放在 query 里，普通链接则取 pathname 末尾。
   */
  const getFilenameFromUrl = (url: string, fallbackName?: string) => {
    if (fallbackName && !fallbackName.startsWith('http')) return fallbackName;

    try {
      const parsedUrl = new URL(url, 'http://localhost:3000');
      const filename =
        parsedUrl.searchParams.get('filename') || parsedUrl.pathname.split('/').pop();
      return filename || fallbackName || 'file';
    } catch {
      return fallbackName || 'file';
    }
  };

  /**
   * 根据 URL 或签名链接里的文件名判断媒体类型。
   * 未命中图片、音频、视频白名单时统一归为普通 file。
   */
  const getFileTypeFromUrl = (url: string): MediaFileType | 'file' => {
    const mediaFileTypes = [
      { type: 'image', fileTypes: imageFileType },
      { type: 'audio', fileTypes: audioFileType },
      { type: 'video', fileTypes: videoFileType }
    ] as const satisfies { type: MediaFileType; fileTypes: string }[];

    const filename = getFilenameFromUrl(url, url);
    const extension = getFileExtension(filename);
    return (
      mediaFileTypes.find(({ fileTypes }) => matchFileType(fileTypes, extension))?.type || 'file'
    );
  };

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
  const createImageContentPart = (url: string): ChatCompletionContentPart => ({
    type: 'image_url',
    image_url: {
      url
    }
  });

  /**
   * 创建音频 content part。
   * input_audio 需要显式 format，因此必须从文件名或 URL 扩展名推断格式。
   */
  const createAudioContentPart = (
    data: string,
    filename = data
  ): ChatCompletionContentPart | undefined => {
    const extension = getFileExtension(filename);
    if (!matchFileType(audioFileType, extension)) return;

    return {
      type: 'input_audio',
      input_audio: {
        data,
        format: extension
      }
    };
  };

  /**
   * 创建视频 content part。
   * 视频协议目前只保留 URL，是否需要 base64 由归一化阶段统一判断。
   */
  const createVideoContentPart = (url: string): ChatCompletionContentPart => ({
    type: 'video_url',
    video_url: {
      url
    }
  });

  /**
   * 判断媒体是否需要在服务端转 base64。
   * 本地路径只有服务端能读取；MULTIPLE_DATA_TO_BASE64 用于兼容不支持远程 URL 的模型。
   */
  const shouldLoadMediaAsBase64 = (url: string) =>
    url.startsWith('/') || serviceEnv.MULTIPLE_DATA_TO_BASE64;

  /**
   * 仅从短文本中识别媒体 URL。普通文档 URL 仍作为文本保留，不在这里转成 LLM 媒体输入。
   */
  const extractMediaUrls = (input: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;

    return Array.from(new Set(input.matchAll(urlRegex)), (m) =>
      m[0].replace(/[，。,.!?;:]+$/, '')
    ).filter((url) => getFileTypeFromUrl(url) !== 'file');
  };

  /**
   * 根据当前模型能力把文本里的媒体 URL 转成 content part。
   * 不支持的媒体类型返回 undefined，后续会保持原文本输入。
   */
  const createMediaContentPartFromUrl = (url: string): ChatCompletionContentPart | undefined => {
    const fileType = getFileTypeFromUrl(url);

    if (fileType === 'image' && useVision) {
      return createImageContentPart(url);
    }

    if (fileType === 'audio' && useAudio) {
      return createAudioContentPart(url, getFilenameFromUrl(url));
    }

    if (fileType === 'video' && useVideo) {
      return createVideoContentPart(url);
    }
  };

  /**
   * 从短文本里提取可由当前模型能力消费的媒体 URL，同时保留原始文本。
   * 长文本不做 URL 拆分，避免把普通上下文里的链接误判成模型输入文件。
   */
  const parseTextUserContentParts = (input: string): ChatCompletionContentPart[] => {
    const shouldExtractFiles = extractFiles ?? useVision;
    if (!shouldExtractFiles || input.length >= 500) {
      return [{ type: 'text', text: input }];
    }

    const mediaParts = extractMediaUrls(input)
      .map((url) => createMediaContentPartFromUrl(url))
      .filter(Boolean) as ChatCompletionContentPart[];

    // Too many media files return text
    if (mediaParts.length > 4) {
      return [{ type: 'text', text: input }];
    }

    return [...mediaParts, { type: 'text', text: input }];
  };

  /**
   * 归一化图片输入：内部文件转 base64，远程图片先做可访问性校验。
   * 返回 undefined 表示图片不可访问，需要从请求消息中过滤。
   */
  const normalizeImageContentPart = async (
    item: Extract<ChatCompletionContentPart, { type: 'image_url' }>
  ): Promise<ChatCompletionContentPart | undefined> => {
    const { key: _key, ...imageItem } = item;
    const imgUrl = imageItem.image_url.url;

    if (imgUrl.startsWith('data:image/')) {
      return imageItem;
    }

    try {
      if (shouldLoadMediaAsBase64(imgUrl)) {
        try {
          const { completeBase64: base64 } = await getImageBase64(imgUrl);

          return {
            ...imageItem,
            image_url: {
              ...imageItem.image_url,
              url: base64
            }
          };
        } catch (error) {
          return Promise.reject(`Cannot load image ${imgUrl}, because ${getErrText(error)}`);
        }
      }

      // 检查下这个图片是否可以被访问，如果不行的话，则过滤掉
      const response = await axios.head(imgUrl, {
        timeout: 10000
      });
      if (response.status < 200 || response.status >= 400) {
        logger.info('Filtered invalid image URL', { url: imgUrl });
        return;
      }

      return imageItem;
    } catch (error: any) {
      if (error?.response?.status === 405 || error?.response?.status === 403) {
        return imageItem;
      }
      logger.warn('Failed to validate image URL', { url: imgUrl, error });
    }
  };

  /**
   * 归一化音频输入：远程 URL 可直接保留，内部文件或强制 base64 场景转成 data URL。
   */
  const normalizeAudioContentPart = async (
    item: Extract<ChatCompletionContentPart, { type: 'input_audio' }>
  ): Promise<ChatCompletionContentPart | undefined> => {
    const { key: _key, ...audioItem } = item;
    const audioData = audioItem.input_audio.data;
    if (audioData.startsWith('data:')) {
      return audioItem;
    }

    if (!shouldLoadMediaAsBase64(audioData)) {
      return audioItem;
    }

    const data = await loadUrlAsBase64Data(audioData);
    return {
      ...audioItem,
      input_audio: {
        ...audioItem.input_audio,
        data
      }
    };
  };

  /**
   * 归一化视频输入，规则与音频一致。
   * 保留 video_url 结构，避免在这里绑定具体供应商字段。
   */
  const normalizeVideoContentPart = async (
    item: Extract<ChatCompletionContentPart, { type: 'video_url' }>
  ): Promise<ChatCompletionContentPart | undefined> => {
    const { key: _key, ...videoItem } = item;
    const videoUrl = videoItem.video_url.url;
    if (videoUrl.startsWith('data:')) {
      return videoItem;
    }

    if (!shouldLoadMediaAsBase64(videoUrl)) {
      return videoItem;
    }

    const url = await loadUrlAsBase64Data(videoUrl);
    return {
      ...videoItem,
      video_url: {
        url
      }
    };
  };

  /**
   * 将 FastGPT 内部 file_url 转成模型可消费的音频/视频 content part。
   * 普通文档文件不会进入 LLM 多模态消息，文档内容由上游读取后以文本提供。
   */
  const normalizeFileUrlContentPart = async (
    item: Extract<ChatCompletionContentPart, { type: 'file_url' }>
  ): Promise<ChatCompletionContentPart | undefined> => {
    const { key: _key, ...fileItem } = item;
    const fileType = fileItem.fileType || getFileTypeFromUrl(fileItem.url);

    // 上传文件会先以 FastGPT 内部的 file_url 存在，发给模型前需要转成供应商支持的
    // input_audio / video_url。普通 file 当前不直接透传给 LLM。
    if (fileType === 'audio' && useAudio) {
      const fileUrl = fileItem.url;
      const filename = getFilenameFromUrl(fileUrl, fileItem.name);
      const audioUrl = shouldLoadMediaAsBase64(fileUrl)
        ? await loadUrlAsBase64Data(fileUrl)
        : fileUrl;

      return createAudioContentPart(audioUrl, filename);
    }

    if (fileType === 'video' && useVideo) {
      const fileUrl = fileItem.url;
      const videoUrl = shouldLoadMediaAsBase64(fileUrl)
        ? await loadUrlAsBase64Data(fileUrl)
        : fileUrl;

      return createVideoContentPart(videoUrl);
    }
  };

  /**
   * 单个 content part 的协议归一化入口。
   * 文本和已支持的非媒体 part 直接透传，媒体 part 按类型分派处理。
   */
  const normalizeMediaContentPart = async (item: ChatCompletionContentPart) => {
    if (item.type === 'image_url') return normalizeImageContentPart(item);
    if (item.type === 'input_audio') return normalizeAudioContentPart(item);
    if (item.type === 'video_url') return normalizeVideoContentPart(item);
    if (item.type === 'file_url') return normalizeFileUrlContentPart(item);

    return item;
  };

  /**
   * 将 FastGPT 内部媒体 content part 归一化为供应商可消费的消息格式。
   * 本地路径和强制 base64 开关会在这里统一转换；内部 key 只会被剥离，不参与处理。
   */
  const normalizeMediaContentParts = async (content: ChatCompletionContentPart[]) => {
    const normalized = await Promise.all(content.map((item) => normalizeMediaContentPart(item)));

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
      const fileType = item.fileType || getFileTypeFromUrl(item.url);
      if (fileType === 'audio' && useAudio) return item;
      if (fileType === 'video' && useVideo) return item;
      return;
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
   */
  const parseUserContent = async (content: string | ChatCompletionContentPart[]) => {
    if (content === undefined) return;
    if (typeof content === 'string') {
      if (content === '') return;

      const normalizedContent = await normalizeMediaContentParts(
        parseTextUserContentParts(content)
      );
      if (normalizedContent.length === 0) return;
      return normalizedContent;
    }

    const supportedContent = content
      .map((item) => filterSupportedUserContentPart(item))
      .filter(Boolean) as ChatCompletionContentPart[];
    const normalizedContent = await normalizeMediaContentParts(supportedContent);

    if (normalizedContent.length === 0) return;
    return normalizedContent;
  };

  /**
   * 格式化 assistant 消息的结构字段。
   * reasoning_content 只在模型声明支持时保留，避免传给不支持 reasoning 字段的供应商。
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
      reasoning_content: supportReason ? item.reasoning_content || undefined : undefined,
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
   * assistant 的工具调用不能合并，否则会破坏 tool call 和 tool response 的对应关系。
   */
  const mergeMessages = ((messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] => {
    return messages.reduce((mergedMessages: ChatCompletionMessageParam[], currentMessage) => {
      const lastMessage = mergedMessages[mergedMessages.length - 1];

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
        lastMessage.content = [...lastContent, ...currentContent];
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
        lastMessage.content = [...lastContent, ...currentContent];
      } else if (
        lastMessage.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
        currentMessage.role === ChatCompletionRequestMessageRoleEnum.Assistant
      ) {
        // Content 不为空的对象，或者是交互节点
        if (
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

          lastMessage.content = [...lastContent, ...currentContent];
        } else {
          // 有其中一个没有 content，说明不是连续的文本输出
          mergedMessages.push(currentMessage);
        }
      } else {
        mergedMessages.push(currentMessage);
      }

      return mergedMessages;
    }, []);
  })(messages);

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
          const content = await parseUserContent(item.content);
          if (!content) {
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
        } else {
          return item;
        }
      })
    )
  ).filter(Boolean) as ChatCompletionMessageParam[];

  return loadMessages;
};
