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
import { getS3ChatSource } from '../../../common/s3/sources/chat';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import { serviceEnv } from '../../../env';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

const isSystemLikeMessage = (message: ChatCompletionMessageParam) =>
  message.role === ChatCompletionRequestMessageRoleEnum.System ||
  message.role === ChatCompletionRequestMessageRoleEnum.Developer;

const isContextCheckpointMessage = (message: ChatCompletionMessageParam) =>
  message.role === ChatCompletionRequestMessageRoleEnum.User &&
  message.hideInUI === true &&
  typeof message.content === 'string' &&
  message.content.trim().startsWith('<context_checkpoint>') &&
  message.content.trim().endsWith('</context_checkpoint>');

type MediaFileType = 'image' | 'audio' | 'video';

const mediaFileTypes = [
  { type: 'image', fileTypes: imageFileType },
  { type: 'audio', fileTypes: audioFileType },
  { type: 'video', fileTypes: videoFileType }
] as const satisfies { type: MediaFileType; fileTypes: string }[];

const getFileExtension = (filename: string) => filename.split('.').pop()?.toLowerCase() || '';

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
    const filename = parsedUrl.searchParams.get('filename') || parsedUrl.pathname.split('/').pop();
    return filename || fallbackName || 'file';
  } catch {
    return fallbackName || 'file';
  }
};

const getFileTypeFromUrl = (url: string): MediaFileType | 'file' => {
  const filename = getFilenameFromUrl(url, url);
  const extension = getFileExtension(filename);
  return (
    mediaFileTypes.find(({ fileTypes }) => matchFileType(fileTypes, extension))?.type || 'file'
  );
};

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

const createVideoContentPart = (url: string): ChatCompletionContentPart => ({
  type: 'video_url',
  video_url: {
    url
  }
});

const getS3FileUrl = async (key?: string) => {
  if (!key) return;

  try {
    return (
      await getS3ChatSource().createGetChatFileURL({
        key,
        external: false
      })
    ).url;
  } catch {}
};

const loadUrlAsBase64Data = async (url: string) => {
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 10000
  });

  return `data:;base64,${Buffer.from(response.data).toString('base64')}`;
};

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

/*
  Format requested messages
  1. If not useVision, only retain text.
  2. Remove file_url
  3. If useVision, parse url from question, and load image from url(Local url)
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
  // Parse user content and normalize FastGPT internal multimodal parts to provider-ready messages.
  const parseUserContent = async (content: string | ChatCompletionContentPart[]) => {
    // Extract media URLs from short plain text questions and build internal content parts.
    const parseStringWithFiles = (input: string): ChatCompletionContentPart[] => {
      const shouldExtractFiles = extractFiles ?? useVision;
      if (!shouldExtractFiles || input.length >= 500) {
        return [{ type: 'text', text: input }];
      }

      const urlRegex = /(https?:\/\/[^\s]+)/gi;

      const result: ChatCompletionContentPart[] = [];

      const mediaUrls = Array.from(new Set(input.matchAll(urlRegex)), (m) =>
        m[0].replace(/[，。,.!?;:]+$/, '')
      ).filter((url) => getFileTypeFromUrl(url) !== 'file');
      mediaUrls.forEach((url) => {
        const fileType = getFileTypeFromUrl(url);
        if (fileType === 'image' && useVision) {
          result.push({
            type: 'image_url',
            image_url: {
              url
            }
          });
        }
        if (fileType === 'audio' && useAudio) {
          const audioPart = createAudioContentPart(url, getFilenameFromUrl(url));
          if (audioPart) {
            result.push(audioPart);
          }
        }
        if (fileType === 'video' && useVideo) {
          result.push(createVideoContentPart(url));
        }
      });

      // Too many media files return text
      if (result.length > 4) {
        return [{ type: 'text', text: input }];
      }

      // 添加原始input作为文本
      result.push({ type: 'text', text: input });
      return result;
    };
    const normalizeMultimodalContentParts = async (content: ChatCompletionContentPart[]) => {
      return (
        await Promise.all(
          content.map(async (item) => {
            if (item.type === 'image_url') {
              const { key, ...imageItem } = item;
              // Remove url origin
              const imgUrl = imageItem.image_url.url;

              // base64 image
              if (imgUrl.startsWith('data:image/')) {
                return imageItem;
              }

              try {
                // If imgUrl is a local path, load image from local, and set url to base64
                if (imgUrl.startsWith('/') || serviceEnv.MULTIPLE_DATA_TO_BASE64) {
                  try {
                    const url = (await getS3FileUrl(key)) || imgUrl;
                    const { completeBase64: base64 } = await getImageBase64(url);

                    return {
                      ...imageItem,
                      image_url: {
                        ...imageItem.image_url,
                        url: base64
                      }
                    };
                  } catch (error) {
                    return Promise.reject(
                      `Cannot load image ${imgUrl}, because ${getErrText(error)}`
                    );
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
              } catch (error: any) {
                if (error?.response?.status === 405 || error?.response?.status === 403) {
                  return imageItem;
                }
                logger.warn('Failed to validate image URL', { url: imgUrl, error });
                return;
              }
            }

            if (item.type === 'input_audio') {
              const { key, ...audioItem } = item;
              const audioData = audioItem.input_audio.data;
              if (audioItem.input_audio.data.startsWith('data:')) {
                return audioItem;
              }

              const shouldLoadAsBase64 =
                !!key || audioData.startsWith('/') || serviceEnv.MULTIPLE_DATA_TO_BASE64;

              if (shouldLoadAsBase64) {
                const data = await loadUrlAsBase64Data((await getS3FileUrl(key)) || audioData);
                return {
                  ...audioItem,
                  input_audio: {
                    ...audioItem.input_audio,
                    data
                  }
                };
              }

              return audioItem;
            }

            if (item.type === 'video_url') {
              const { key, ...videoItem } = item;
              const videoUrl = videoItem.video_url.url;
              if (videoUrl.startsWith('data:')) {
                return videoItem;
              }

              const shouldLoadAsBase64 =
                !!key || videoUrl.startsWith('/') || serviceEnv.MULTIPLE_DATA_TO_BASE64;

              if (shouldLoadAsBase64) {
                const url = await loadUrlAsBase64Data((await getS3FileUrl(key)) || videoUrl);
                return {
                  ...videoItem,
                  video_url: {
                    url
                  }
                };
              }

              return videoItem;
            }

            if (item.type !== 'file_url') return item;
            const { key, ...fileItem } = item;

            // 上传文件会先以 FastGPT 内部的 file_url 存在，发给模型前需要转成供应商支持的
            // input_audio / video_url。普通 file 当前不直接透传给 LLM。
            const fileType = fileItem.fileType || getFileTypeFromUrl(fileItem.url);
            if (fileType === 'audio' && useAudio) {
              const fileUrl = (await getS3FileUrl(key)) || fileItem.url;
              const filename = getFilenameFromUrl(fileUrl, fileItem.name);
              const audioUrl =
                key || fileUrl.startsWith('/') || serviceEnv.MULTIPLE_DATA_TO_BASE64
                  ? await loadUrlAsBase64Data(fileUrl)
                  : fileUrl;
              return createAudioContentPart(audioUrl, filename);
            }
            if (fileType === 'video' && useVideo) {
              const fileUrl = (await getS3FileUrl(key)) || fileItem.url;
              const videoUrl =
                key || fileUrl.startsWith('/') || serviceEnv.MULTIPLE_DATA_TO_BASE64
                  ? await loadUrlAsBase64Data(fileUrl)
                  : fileUrl;
              return createVideoContentPart(videoUrl);
            }
          })
        )
      ).filter(Boolean) as ChatCompletionContentPart[];
    };

    if (content === undefined) return;
    if (typeof content === 'string') {
      if (content === '') return;

      const normalizedContent = await normalizeMultimodalContentParts(
        parseStringWithFiles(content)
      );
      if (normalizedContent.length === 0) return;
      return normalizedContent;
    }

    const result = (
      await Promise.all(
        content.map(async (item) => {
          // Filter unsupported content parts before provider-specific normalization.
          if (item.type === 'text') {
            // If it is array, not need to parse image
            if (item.text) return item;
            return;
          }
          if (item.type === 'file_url') {
            const fileType = item.fileType || getFileTypeFromUrl(item.url);
            if (fileType === 'audio' && useAudio) return item;
            if (fileType === 'video' && useVideo) return item;
            return;
          }
          if (item.type === 'input_audio' && !useAudio) return;
          if (item.type === 'video_url' && !useVideo) return;
          if (item.type === 'image_url') {
            // close vision, remove image_url
            if (!useVision) return;
            // remove empty image_url
            if (!item.image_url.url) return;
          }

          return item;
        })
      )
    )
      .flat()
      .filter(Boolean) as ChatCompletionContentPart[];

    const normalizedContent = await normalizeMultimodalContentParts(result);

    if (normalizedContent.length === 0) return;
    return normalizedContent;
  };

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

  // 合并相邻 role 的内容，只保留一个 role， content 变成数组。 assistant 的话，工具调用不合并。
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
        // 解构剥离系统内部字段，避免 mutate 调用方传入的 messages
        const { dataId: _dataId, hideInUI: _hideInUI, ...item } = raw;

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
