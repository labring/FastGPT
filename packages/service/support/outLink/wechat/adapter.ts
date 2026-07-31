import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getS3ChatSource } from '../../../common/s3/sources/chat';
import {
  normalizeMimeType,
  resolveMimeExtension,
  resolveMimeType
} from '../../../common/s3/utils/mime';
import { getLogger, LogCategories } from '../../../common/logger';
import {
  composeOutLinkQuery,
  createOutLinkFileLimitStream,
  OutLinkFileSizeExceededError
} from '../tools';
import type {
  OutlinkMessage,
  OutlinkQueryResolveOptions,
  OutlinkResponder
} from '../../../support/outLink/runtime/type';
import type { WechatReplyJobData } from './type';
import {
  WechatMessageItemType,
  type CDNMedia,
  type ILinkClient,
  type MessageItem
} from './ilinkClient';

const logger = getLogger(LogCategories.MODULE.OUTLINK.WECHAT);
const WECHAT_CDN_BASE_URL = 'https://novac2c.cdn.weixin.qq.com/c2c';
const WECHAT_MEDIA_TIMEOUT_MS = 30_000;

type WechatMediaResource = {
  item: MessageItem;
  fileType: ChatFileTypeEnum.image | ChatFileTypeEnum.file;
};

type ParsedWechatItems = {
  query: UserChatItemValueItemType[];
  resources: WechatMediaResource[];
};

type CreateWechatOutlinkAdapterProps = {
  client: ILinkClient;
  jobData: WechatReplyJobData;
  appId: string;
};

/** 将 iLink 回复任务转换为共享 runtime 消息，并把终态事件发送回微信。 */
export const createWechatOutlinkAdapter = ({
  client,
  jobData,
  appId
}: CreateWechatOutlinkAdapterProps) => {
  const chatId = `wechat_${jobData.shareId}_${jobData.userId}`;
  const items = jobData.items ?? [];

  /** 将微信媒体字段的两种 AES key 编码还原为 AES-128-ECB 原始密钥。 */
  const parseAesKey = (aesKey: string) => {
    const decoded = Buffer.from(aesKey, 'base64');
    if (decoded.length === 16) return decoded;
    if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString('ascii'))) {
      return Buffer.from(decoded.toString('ascii'), 'hex');
    }
    throw new Error('Invalid Wechat CDN AES key');
  };

  const getMediaUrl = (media: CDNMedia) => {
    if (media.full_url) return media.full_url;
    if (media.encrypt_query_param) {
      return `${WECHAT_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param)}`;
    }
    throw new Error('Wechat media download URL is missing');
  };

  /** 下载受限的 CDN 媒体；AES 文件仅多允许一个 PKCS7 block 的密文开销。 */
  const downloadMedia = async ({
    media,
    maxBytes,
    encrypted
  }: {
    media: CDNMedia;
    maxBytes: number;
    encrypted: boolean;
  }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WECHAT_MEDIA_TIMEOUT_MS);
    const allowedBytes = encrypted ? maxBytes + 16 : maxBytes;

    try {
      const response = await fetch(getMediaUrl(media), { signal: controller.signal });
      if (!response.ok) throw new Error(`Wechat CDN download failed: HTTP ${response.status}`);
      if (!response.body) throw new Error('Wechat CDN response body is empty');

      const contentLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(contentLength) && contentLength > allowedBytes) {
        throw new OutLinkFileSizeExceededError(maxBytes);
      }

      return {
        buffer: await buffer(
          createOutLinkFileLimitStream({
            source: Readable.fromWeb(response.body as never),
            maxBytes: allowedBytes
          })
        ),
        contentType: normalizeMimeType(response.headers.get('content-type') ?? undefined, '')
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const decryptAesEcb = (encrypted: Buffer, key: Buffer) => {
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  };

  /** 解析当前消息项。 */
  const parseItems = (sourceItems: MessageItem[]): ParsedWechatItems => {
    const query: UserChatItemValueItemType[] = [];
    const resources: WechatMediaResource[] = [];

    for (const item of sourceItems) {
      if (item.type === WechatMessageItemType.TEXT && item.text_item?.text) {
        query.push({ text: { content: item.text_item.text } });
      } else if (item.type === WechatMessageItemType.VOICE) {
        // iLink 当前通过 voice_item.text 提供上游转写结果，v1 仅使用该文本。
        if (item.voice_item?.text) query.push({ text: { content: item.voice_item.text } });
        // 缺少文本时暂不下载、转码或调用 STT；后续应复用 runtime 媒体解析和 aiTranscriptions 计费链路。
      } else if (item.type === WechatMessageItemType.IMAGE && item.image_item?.media) {
        resources.push({ item, fileType: ChatFileTypeEnum.image });
      } else if (item.type === WechatMessageItemType.FILE && item.file_item?.media?.aes_key) {
        resources.push({ item, fileType: ChatFileTypeEnum.file });
      }
    }

    return { query, resources };
  };

  /**
   * As of 2026.7.31, WeChat does not provide a way to get referenced messages.
   * @see https://github.com/Tencent/openclaw-weixin/issues/222
   *
   * @todo Add support for message refs.
   */
  const current = parseItems(items);

  const resolveResource = async ({
    item,
    fileType,
    maxBytes
  }: WechatMediaResource & { maxBytes: number }): Promise<UserChatItemValueItemType> => {
    try {
      const media = item.image_item?.media ?? item.file_item?.media;
      if (!media) throw new Error('Wechat media is missing');

      const imageAesKey = item.image_item?.aeskey;
      const aesKey = (() => {
        if (imageAesKey) {
          if (!/^[0-9a-fA-F]{32}$/.test(imageAesKey))
            throw new Error('Invalid Wechat image AES key');
          return Buffer.from(imageAesKey, 'hex');
        }
        return media.aes_key ? parseAesKey(media.aes_key) : undefined;
      })();
      const { buffer: downloaded, contentType } = await downloadMedia({
        media,
        maxBytes,
        encrypted: Boolean(aesKey)
      });
      const fileBuffer = aesKey ? decryptAesEcb(downloaded, aesKey) : downloaded;
      if (fileBuffer.length > maxBytes) throw new OutLinkFileSizeExceededError(maxBytes);

      const filename = (() => {
        if (fileType === ChatFileTypeEnum.file) return item.file_item?.file_name || 'file';
        return `image${resolveMimeExtension(contentType) || '.jpg'}`;
      })();
      const resolvedContentType = contentType || resolveMimeType([filename]);
      const { key } = await getS3ChatSource().uploadChatFile({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        body: fileBuffer,
        chatId,
        uId: jobData.userId,
        filename,
        contentType: resolvedContentType
      });

      return {
        file: {
          type: fileType,
          name: filename,
          url: '',
          key
        }
      };
    } catch (error) {
      logger.error('Failed to resolve Wechat media', {
        shareId: jobData.shareId,
        messageId: jobData.lastMsgId,
        fileType,
        error: String(error)
      });
      if (error instanceof OutLinkFileSizeExceededError) {
        throw new UserError('文件大小超过上传限制');
      }
      throw new UserError('文件处理失败，请稍后重试');
    }
  };

  const normalizeMessage = async (): Promise<OutlinkMessage> => {
    const query = current.query;

    return {
      chatId,
      messageId: jobData.lastMsgId,
      chatUserId: jobData.userId,
      query,
      resolveQuery: async ({ maxFileAmount, maxBytesPerFile }: OutlinkQueryResolveOptions) => {
        const fileLimit = Math.max(0, Math.floor(maxFileAmount));
        const currentResources = current.resources.slice(0, fileLimit);

        const currentFiles = [] as UserChatItemValueItemType[];
        for (const resource of currentResources) {
          currentFiles.push(await resolveResource({ ...resource, maxBytes: maxBytesPerFile }));
        }
        return composeOutLinkQuery(current.query, currentFiles);
      }
    };
  };

  const respond: OutlinkResponder = async (events) => {
    for await (const event of events) {
      if (event.type !== 'done' && event.type !== 'error') continue;

      await client.sendMessage({
        to_user_id: jobData.userId,
        text: event.content,
        context_token: jobData.contextToken
      });
    }
  };

  return { normalizeMessage, respond };
};
