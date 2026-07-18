import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam
} from '@fastgpt/global/core/ai/llm/type';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getFileMaxSize } from '../../common/file/utils';
import { isValidImageContentType } from '../../common/file/image/utils';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import { serviceEnv } from '../../env';

type NormalizeCompletionMessagesProps = {
  messages: ChatCompletionMessageParam[];
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId: string;
  uid: string;
};

/**
 * 从最后一条用户消息提取文本；没有用户消息时原样返回调用方提供的 fallback。
 */
export const getCompletionStartHookText = ({
  messages,
  fallback
}: {
  messages: ChatCompletionMessageParam[];
  fallback: string;
}) => {
  const latestMessage = messages.at(-1);
  if (latestMessage?.role !== 'user') return fallback;
  if (typeof latestMessage.content === 'string') return latestMessage.content;

  return latestMessage.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('');
};

const imageExtensionMap: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/svg+xml': 'svg',
  'image/vnd.microsoft.icon': 'ico',
  'image/x-icon': 'ico'
};

/**
 * 解析图片 Data URL，并在解码前校验格式和大小，避免超大 base64 产生额外内存峰值。
 */
const parseImageDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) {
    throw new UserError('Invalid image base64 data URL');
  }

  const contentType = match[1].toLowerCase();
  if (!isValidImageContentType(contentType)) {
    throw new UserError(`Unsupported image content type: ${contentType}`);
  }

  const base64 = match[2].replace(/[\r\n]/g, '');
  const paddingLength = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const decodedSize = Math.floor((base64.length * 3) / 4) - paddingLength;
  const maxSize = getFileMaxSize();
  if (decodedSize <= 0 || decodedSize > maxSize) {
    throw new UserError(`Image size exceeds limit: ${decodedSize} bytes, maximum ${maxSize} bytes`);
  }

  const body = Buffer.from(base64, 'base64');
  if (body.length !== decodedSize) {
    throw new UserError('Invalid image base64 data');
  }

  const subtype = contentType.split('/')[1];
  const extension = imageExtensionMap[contentType] ?? subtype;

  return {
    body,
    contentType,
    filename: `image.${extension}`
  };
};

/**
 * 规范化 completions 消息中的 base64 图片。
 *
 * 当模型允许直接使用 URL 时，先把 Data URL 上传到当前会话的私有 S3 路径，再用临时预览
 * URL 覆写运行态消息，并附带稳定 key。运行结束后聊天持久化只保存 key，不保存 base64 或
 * 过期签名 URL。同一请求中重复出现的 Data URL 只上传一次。
 */
export const normalizeCompletionMessages = async ({
  messages,
  sourceType,
  sourceId,
  chatId,
  uid
}: NormalizeCompletionMessagesProps): Promise<ChatCompletionMessageParam[]> => {
  if (serviceEnv.MULTIPLE_DATA_TO_BASE64) return messages;

  const chatS3 = getS3ChatSource();
  const uploadCache = new Map<string, Promise<{ key: string; url: string }>>();

  const normalizeImagePart = async (
    part: Extract<ChatCompletionContentPart, { type: 'image_url' }>
  ): Promise<typeof part> => {
    const dataUrl = part.image_url.url;
    if (!/^data:image\//i.test(dataUrl)) return part;

    const uploadResult = (() => {
      const cached = uploadCache.get(dataUrl);
      if (cached) return cached;

      const upload = (async () => {
        const { body, contentType, filename } = parseImageDataUrl(dataUrl);
        const { key, accessUrl } = await chatS3.uploadChatFile({
          sourceType,
          sourceId,
          chatId,
          uId: uid,
          filename,
          body,
          contentType
        });

        return { key, url: accessUrl.url };
      })();

      uploadCache.set(dataUrl, upload);
      return upload;
    })();

    const { key, url } = await uploadResult;
    return {
      ...part,
      key,
      image_url: {
        ...part.image_url,
        url
      }
    };
  };

  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== 'user' || !Array.isArray(message.content)) return message;

      const content = await Promise.all(
        message.content.map((part) =>
          part.type === 'image_url' ? normalizeImagePart(part) : Promise.resolve(part)
        )
      );

      return {
        ...message,
        content
      };
    })
  );
};
