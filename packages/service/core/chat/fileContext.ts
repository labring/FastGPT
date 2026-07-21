import { audioFileType, imageFileType, videoFileType } from '@fastgpt/global/common/file/constants';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type {
  ChatItemMiniType,
  UserChatItemFileItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import { getS3RawTextSource } from '../../common/s3/sources/rawText';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../../common/system/utils';
import { axios } from '../../common/api/axios';
import { S3Buckets } from '../../common/s3/config/constants';
import { S3Sources } from '../../common/s3/contracts/type';
import {
  detectFileEncoding,
  parseContentDispositionFilename
} from '@fastgpt/global/common/file/tools';
import path from 'path';
import { getFileS3Key } from '../../common/s3/utils';
import { S3ChatSource } from '../../common/s3/sources/chat';
import { readFileContentByBuffer } from '../../common/file/read/utils';
import { addDays } from 'date-fns';
import { replaceS3KeyToPreviewUrl } from '../dataset/utils';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import { getUserFilesPrompt, injectUserQueryPrompt } from '../ai/llm/prompt';
import { getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';
import {
  DEFAULT_CONTENT_TYPE,
  normalizeMimeType,
  resolveMimeExtension
} from '../../common/s3/utils/mime';
import { isLikelyTextBuffer } from '../../common/file/read/text';
import {
  S3_ACCESS_LINK_ROUTES,
  S3SignedDownloadAliasValueSchema,
  verifyS3DownloadAccess,
  type VerifiedS3DownloadAccess
} from '../../common/s3/accessLink';
import { getFileMaxSize } from '../../common/file/utils';
import { readStreamToBuffer } from '../../common/s3/utils';
import { Readable } from 'node:stream';

/** Workflow 等上层业务可显式注入的已授权文件读取能力。 */
export type FileReadContext = {
  resolve: (urlOrId: string) =>
    | {
        name: string;
        type: ChatFileTypeEnum;
        modelUrl: string;
      }
    | undefined;
  resolveChatFile: (url: string) => UserChatItemFileItemType | undefined;
  getIdentity: (urlOrId: string) => string | undefined;
  read: (urlOrId: string) => Promise<{
    buffer: Buffer;
    filename: string;
    contentType?: string;
    sourceKind: 'internal' | 'external';
    imageParsePrefix?: string;
  }>;
};

type GetFileProps = {
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  teamId: string;
  tmbId: string;
  usageId?: string;
  fileContext?: FileReadContext;
};

const readableFileExtensions = new Set(['txt', 'md', 'html', 'pdf', 'docx', 'pptx', 'csv', 'xlsx']);

const normalizeReadableExtension = (extension?: string) =>
  extension?.trim().toLowerCase().replace(/^\./, '') || '';

const resolveSupportedReadableExtension = (extension?: string) => {
  const normalizedExtension = normalizeReadableExtension(extension);
  const aliasExtension = (() => {
    if (normalizedExtension === 'markdown') return 'md';
    if (normalizedExtension === 'htm') return 'html';
    return normalizedExtension;
  })();

  return readableFileExtensions.has(aliasExtension) ? aliasExtension : '';
};

const fileTypeIncludesExtension = (fileTypes: string, extension: string) =>
  !!extension && fileTypes.split(',').some((item) => item.trim() === extension);

const resolveMediaChatFileTypeFromFilename = (filename?: string) => {
  const extension = path.extname(filename || '').toLowerCase();
  if (fileTypeIncludesExtension(imageFileType, extension)) return ChatFileTypeEnum.image;
  if (fileTypeIncludesExtension(audioFileType, extension)) return ChatFileTypeEnum.audio;
  if (fileTypeIncludesExtension(videoFileType, extension)) return ChatFileTypeEnum.video;
};

const resolveMediaChatFileTypeFromContentType = (contentType?: string) => {
  const normalizedContentType = normalizeMimeType(contentType, '');
  if (normalizedContentType.startsWith('image/')) return ChatFileTypeEnum.image;
  if (normalizedContentType.startsWith('audio/')) return ChatFileTypeEnum.audio;
  if (normalizedContentType.startsWith('video/')) return ChatFileTypeEnum.video;
};

const resolveMediaChatFileTypeFromDownloadAccess = (access: VerifiedS3DownloadAccess) => {
  const contentTypeFileType = resolveMediaChatFileTypeFromContentType(access.responseContentType);
  if (contentTypeFileType) return contentTypeFileType;

  return (
    resolveMediaChatFileTypeFromFilename(access.filename) ||
    resolveMediaChatFileTypeFromFilename(access.objectKey)
  );
};

const resolveSignedDownloadAliasFromUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url, 'http://localhost:3000');
    const routePrefix = `${S3_ACCESS_LINK_ROUTES.download}/`;
    const routeIndex = parsedUrl.pathname.indexOf(routePrefix);

    const signedAlias = (() => {
      if (routeIndex >= 0) {
        return decodeURIComponent(
          parsedUrl.pathname.slice(routeIndex + routePrefix.length).split('/')[0] || ''
        );
      }

      // 支持 FILE_DOWNLOAD_PUBLIC_URL_PREFIX 暴露的 nginx 短路径:
      //   /{signedAlias}
      //   /f/{signedAlias}
      // 这类 URL 的 path 不是文件名，最后一段只有通过短链格式和 HMAC 校验后才可信。
      const lastPathSegment = parsedUrl.pathname.split('/').filter(Boolean).at(-1) || '';
      return decodeURIComponent(lastPathSegment);
    })();

    return S3SignedDownloadAliasValueSchema.safeParse(signedAlias).success ? signedAlias : '';
  } catch {
    return '';
  }
};

/**
 * 短链 path 只携带 alias/expiry/signature，不能当作文件名或后缀。
 * 文件解析需要先把短链还原成真实对象，再用 alias 记录中的 filename/objectKey 推断类型。
 */
const resolveShortDownloadAccessFromUrl = async (
  url: string
): Promise<VerifiedS3DownloadAccess | undefined> => {
  const signedAlias = resolveSignedDownloadAliasFromUrl(url);
  if (!signedAlias) return;

  return verifyS3DownloadAccess(signedAlias);
};

const resolveShortLinkMediaFileItem = async (file: UserChatItemFileItemType) => {
  if (file.type !== ChatFileTypeEnum.file) return file;
  if (!resolveSignedDownloadAliasFromUrl(file.url)) return file;

  try {
    const shortDownloadAccess = await resolveShortDownloadAccessFromUrl(file.url);
    if (!shortDownloadAccess) return file;

    const mediaType = resolveMediaChatFileTypeFromDownloadAccess(shortDownloadAccess);
    if (!mediaType) return file;

    return {
      ...file,
      type: mediaType,
      name:
        file.name ||
        shortDownloadAccess.filename ||
        path.basename(shortDownloadAccess.objectKey) ||
        file.url
    };
  } catch {
    return file;
  }
};

const resolveShortLinkMediaFilesInUserQuery = async (userQuery: UserChatItemValueItemType[]) => {
  let changed = false;

  const normalizedUserQuery = await Promise.all(
    userQuery.map(async (item) => {
      if (!item.file) return item;

      const file = await resolveShortLinkMediaFileItem(item.file);
      if (file === item.file) return item;

      changed = true;
      return {
        ...item,
        file
      };
    })
  );

  return changed ? normalizedUserQuery : userQuery;
};

/**
 * 解析文件读取 worker 使用的扩展名。外部 URL 可能没有后缀，例如 GitHub raw LICENSE；
 * 这时允许从响应 Content-Type 或文本内容推断为 txt，但显式存在的不支持后缀仍交给 worker 报错。
 */
const resolveReadFileExtension = ({
  extension,
  contentType,
  buffer
}: {
  extension: string;
  contentType?: string;
  buffer: Buffer;
}) => {
  const normalizedExtension = normalizeReadableExtension(extension);
  const supportedExtension = resolveSupportedReadableExtension(normalizedExtension);
  if (supportedExtension) return supportedExtension;

  if (normalizedExtension) return normalizedExtension;

  const normalizedContentType = normalizeMimeType(contentType, '');
  const mimeExtension = resolveSupportedReadableExtension(
    resolveMimeExtension(normalizedContentType)
  );
  if (mimeExtension) return mimeExtension;

  if (normalizedContentType.startsWith('text/')) return 'txt';

  if (
    (!normalizedContentType || normalizedContentType === DEFAULT_CONTENT_TYPE) &&
    isLikelyTextBuffer(buffer)
  ) {
    return 'txt';
  }

  return '';
};

/**
 * 将 URL 解析成 ChatBox 文件结构。
 *
 * `urlTypeMap` 用于 workflow 运行态传入显式文件类型；普通聊天/辅助生成场景则按文件名后缀推断。
 */
export const parseUrlToChatFileType = ({
  url,
  urlTypeMap = {}
}: {
  url: string;
  urlTypeMap?: Record<string, ChatFileTypeEnum>;
}): UserChatItemFileItemType | undefined => {
  if (typeof url !== 'string') return;

  if (url.startsWith('data:')) {
    const matches = url.match(/^data:([^;]+);base64,/);
    if (!matches) return;

    const mimeType = matches[1].toLowerCase();
    if (!mimeType.startsWith('image/')) return;

    const extension = mimeType.split('/')[1];
    return {
      type: ChatFileTypeEnum.image,
      name: `image.${extension}`,
      url
    };
  }

  try {
    const parseUrl = new URL(url, 'http://localhost:3000');

    const filename = (() => {
      if (url.startsWith('chat/')) {
        const basename = path.basename(url);
        return basename.includes('.') ? basename : '';
      }

      const fromParam = parseUrl.searchParams.get('filename');
      if (fromParam) return fromParam;

      const basename = path.basename(parseUrl.pathname);
      return basename.includes('.') ? basename : '';
    })();

    const type = urlTypeMap[url];
    if (type) {
      return {
        type,
        name: filename ? decodeURIComponent(filename) : url,
        url
      };
    }

    const extension = filename?.split('.').pop()?.toLowerCase() || '';

    if (extension && imageFileType.includes(extension)) {
      return {
        type: ChatFileTypeEnum.image,
        name: filename ? decodeURIComponent(filename) : url,
        url
      };
    }
    if (extension && audioFileType.includes(extension)) {
      return {
        type: ChatFileTypeEnum.audio,
        name: filename ? decodeURIComponent(filename) : url,
        url
      };
    }
    if (extension && videoFileType.includes(extension)) {
      return {
        type: ChatFileTypeEnum.video,
        name: filename ? decodeURIComponent(filename) : url,
        url
      };
    }

    return {
      type: ChatFileTypeEnum.file,
      name: filename ? decodeURIComponent(filename) : url,
      url
    };
  } catch {
    return {
      type: ChatFileTypeEnum.file,
      name: url,
      url
    };
  }
};

export const formatUserQueryWithFiles = async ({
  userQuery,
  parseFileFn
}: {
  userQuery: UserChatItemValueItemType[];
  parseFileFn: (urls: string[]) => Promise<
    {
      id?: string;
      name: string;
      url: string;
      sandboxPath?: string;
      content?: string;
    }[]
  >;
}): Promise<UserChatItemValueItemType[]> => {
  const hasShortLinkFile = userQuery.some(
    (item) =>
      item.file?.type === ChatFileTypeEnum.file &&
      !!resolveSignedDownloadAliasFromUrl(item.file.url)
  );
  const normalizedUserQuery = hasShortLinkFile
    ? await resolveShortLinkMediaFilesInUserQuery(userQuery)
    : userQuery;
  const urls = normalizedUserQuery
    .map((item) => (item.file?.type === ChatFileTypeEnum.file ? item.file.url : ''))
    .filter(Boolean);

  if (urls.length === 0) {
    return normalizedUserQuery;
  }

  const readFilesResult = await parseFileFn(urls);

  if (readFilesResult.length === 0) {
    return normalizedUserQuery;
  }

  // 把 file 和 text 合并成一个 text(实际上应该只会有一个 text+多个 files)
  const text = normalizedUserQuery.find((item) => item.text?.content)?.text?.content;
  const fileQuery = getUserFilesPrompt(readFilesResult);

  const finalQuery = injectUserQueryPrompt({
    query: text,
    filePrompt: fileQuery
  });

  return [
    {
      text: {
        content: finalQuery
      }
    }
  ];
};

/**
 * 在发送给 LLM 前把 Human 消息里的普通文件解析为文本上下文。
 *
 * 历史 Human 消息是否解析由调用方控制；未解析时会移除历史文件项，避免旧文件继续作为模型文件输入。
 */
export const rewriteChatMessagesWithFileContext = async ({
  messages,
  parseHistoryFiles,
  parseFileFn
}: {
  messages: ChatItemMiniType[];
  parseHistoryFiles: boolean;
  parseFileFn: (urls: string[]) => Promise<
    {
      id?: string;
      name: string;
      url: string;
      sandboxPath?: string;
      content?: string;
    }[]
  >;
}) => {
  return Promise.all(
    messages.map(async (message, index): Promise<ChatItemMiniType> => {
      if (message.obj !== ChatRoleEnum.Human) {
        return message;
      }

      const isCurrentUserMessage = index === messages.length - 1;
      if (!isCurrentUserMessage && !parseHistoryFiles) {
        return {
          ...message,
          value: message.value.filter((item) => !item.file)
        };
      }

      const query = await formatUserQueryWithFiles({
        userQuery: message.value,
        parseFileFn
      });

      return {
        ...message,
        value: query
      };
    })
  );
};

/**
 * 格式化文件 URL，移除请求头部分，只保留文件 URL
 */
export const normalizeReadableFileUrl = ({
  url,
  fileContext
}: {
  url?: string;
  requestOrigin?: string;
  fileContext?: FileReadContext;
}) => {
  if (typeof url !== 'string') return '';

  const normalizedUrl = url.trim();
  if (!normalizedUrl) return '';

  if (fileContext) {
    const ref = fileContext.resolve(normalizedUrl);
    return ref?.type === ChatFileTypeEnum.file ? ref.modelUrl : '';
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) return '';
  if (parseUrlToChatFileType({ url: normalizedUrl })?.type !== ChatFileTypeEnum.file) {
    return '';
  }

  try {
    const parsedURL = new URL(normalizedUrl);
    if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') return '';
    return normalizedUrl;
  } catch {
    return '';
  }
};

export const getFileInfoFromUrl = async ({
  teamId,
  url,
  fileContext
}: {
  teamId: string;
  url: string;
  fileContext?: FileReadContext;
}) => {
  const fileRef = fileContext?.resolve(url);
  if (fileContext && !fileRef) {
    throw new UserError('File is not registered in the provided context');
  }

  if (fileRef && fileContext) {
    const { buffer, filename, contentType, sourceKind, imageParsePrefix } =
      await fileContext.read(url);
    const isChatExternalUrl = sourceKind === 'external';
    const resolvedFilename = filename || fileRef.name;

    return {
      isChatExternalUrl,
      filename: resolvedFilename,
      extension: path.extname(resolvedFilename).replace('.', ''),
      imageParsePrefix: isChatExternalUrl
        ? getFileS3Key.temp({ teamId, filename: resolvedFilename }).fileParsedPrefix
        : imageParsePrefix || '',
      contentType,
      stream: buffer
    };
  }

  if (!/^https?:\/\//i.test(url)) {
    throw new UserError('File URL must be an absolute HTTP(S) URL');
  }
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new UserError('File URL must use HTTP(S)');
  }

  const shortDownloadAccess = await resolveShortDownloadAccessFromUrl(url);
  const maxFileSize = getFileMaxSize();
  const response = await axios.get<Readable>(url, {
    responseType: 'stream',
    timeout: 180_000,
    maxContentLength: maxFileSize
  });
  const contentLength = Number(getAxiosHeaderValue(response.headers['content-length']) || 0);
  if (contentLength > maxFileSize) {
    response.data.destroy();
    throw new UserError(`File exceeds maximum allowed size (${maxFileSize} bytes)`);
  }
  const responseStream =
    response.data instanceof Readable
      ? response.data
      : Readable.from([Buffer.from(response.data as unknown as ArrayBuffer)]);
  const buffer = await readStreamToBuffer({
    stream: responseStream,
    maxBytes: maxFileSize,
    exceededMessage: `File exceeds maximum allowed size (${maxFileSize} bytes)`
  });

  const urlObj = new URL(url, 'http://localhost:3000');
  const isShortChatFile =
    shortDownloadAccess?.bucketName === S3Buckets.private &&
    shortDownloadAccess.objectKey.startsWith(`${S3Sources.chat}/`);
  const isChatExternalUrl =
    !isShortChatFile && !urlObj.pathname.startsWith(`/${S3Buckets.private}/${S3Sources.chat}/`);

  // Get file name
  const { filename, extension, imageParsePrefix } = (() => {
    if (isShortChatFile && shortDownloadAccess) {
      const parsedChatUrl = S3ChatSource.parseChatUrl(
        new URL(
          `/${shortDownloadAccess.bucketName}/${shortDownloadAccess.objectKey}`,
          'http://localhost:3000'
        )
      );
      const filename =
        shortDownloadAccess.filename ||
        parsedChatUrl.filename ||
        path.basename(shortDownloadAccess.objectKey);

      return {
        filename,
        extension: path.extname(filename).replace('.', '') || parsedChatUrl.extension,
        imageParsePrefix: parsedChatUrl.imageParsePrefix
      };
    }

    if (isChatExternalUrl) {
      const contentDisposition = getAxiosHeaderValue(response.headers['content-disposition']) || '';
      const matchFilename = parseContentDispositionFilename(contentDisposition);
      const filename =
        shortDownloadAccess?.filename ||
        matchFilename ||
        (shortDownloadAccess?.objectKey ? path.basename(shortDownloadAccess.objectKey) : '') ||
        urlObj.pathname.split('/').pop() ||
        'file';
      const extension = path.extname(filename).replace('.', '');

      return {
        filename,
        extension,
        imageParsePrefix: getFileS3Key.temp({ teamId, filename }).fileParsedPrefix
      };
    }

    return S3ChatSource.parseChatUrl(url);
  })();

  return {
    isChatExternalUrl,
    filename,
    extension,
    imageParsePrefix,
    contentType:
      shortDownloadAccess?.responseContentType ||
      getAxiosHeaderValue(response.headers['content-type']),
    stream: buffer
  };
};

export const getFileContentByUrl = async ({
  url,
  teamId,
  tmbId,
  customPdfParse,
  usageId,
  fileContext
}: {
  url: string;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
  fileContext?: FileReadContext;
}) => {
  const sourceId = fileContext?.getIdentity(url) ?? url;
  // Get from buffer
  const rawTextBuffer = await getS3RawTextSource().getRawTextBuffer({
    sourceId,
    customPdfParse
  });
  if (rawTextBuffer) {
    return {
      name: rawTextBuffer.filename,
      url,
      content: rawTextBuffer.text
    };
  }

  const { isChatExternalUrl, filename, extension, imageParsePrefix, contentType, stream } =
    await getFileInfoFromUrl({ teamId, url, fileContext });

  const buffer = stream;
  // Get encoding
  const encoding = (() => {
    if (contentType) {
      const charsetRegex = /charset=([^;]*)/;
      const matches = charsetRegex.exec(contentType);
      if (matches != null && matches[1]) {
        return matches[1];
      }
    }

    return detectFileEncoding(buffer);
  })();

  const readExtension = resolveReadFileExtension({
    extension,
    contentType,
    buffer
  });

  const { rawText } = await readFileContentByBuffer({
    extension: readExtension,
    teamId,
    tmbId,
    buffer,
    encoding,
    customPdfParse,
    getFormatText: true,
    imageKeyOptions: imageParsePrefix
      ? {
          prefix: imageParsePrefix,
          // 聊天对话里面上传的外部链接，解析出来的图片过期时间设置为1天，而且是存储在临时文件夹的
          expiredTime: isChatExternalUrl ? addDays(new Date(), 1) : undefined
        }
      : undefined,
    usageId
  });

  const replacedText = await replaceS3KeyToPreviewUrl(rawText, addDays(new Date(), 90));

  // Add to buffer
  getS3RawTextSource().addRawTextBuffer({
    sourceId,
    sourceName: filename,
    text: replacedText,
    customPdfParse
  });

  return {
    name: filename,
    url,
    content: replacedText
  };
};
export const parseFileContentFromUrls = async ({
  urls,
  requestOrigin,
  maxFiles,
  teamId,
  tmbId,
  customPdfParse,
  usageId,
  fileContext
}: GetFileProps & {
  urls: string[];
}): Promise<
  {
    success: boolean;
    name: string;
    url: string;
    content: string;
  }[]
> => {
  const parseUrlList = urls
    .map((url) => normalizeReadableFileUrl({ url, requestOrigin, fileContext }))
    .filter(Boolean)
    .slice(0, maxFiles);

  const readFilesResult = await Promise.all(
    parseUrlList
      .map(async (url) => {
        try {
          if (!fileContext?.resolve(url) && (await isInternalAddress(url))) {
            return {
              success: false,
              name: '',
              url,
              content: PRIVATE_URL_TEXT
            };
          }

          const { name, content } = await getFileContentByUrl({
            url,
            teamId,
            tmbId,
            customPdfParse,
            usageId,
            fileContext
          });

          return { success: true, name, url, content: content };
        } catch (error) {
          return {
            success: false,
            name: '',
            url,
            content: getErrText(error, 'Load file error')
          };
        }
      })
      .filter(Boolean)
  );

  return readFilesResult;
};
export const parseFileInfoFromUrls = async ({
  urls,
  requestOrigin,
  maxFiles,
  teamId,
  fileContext
}: {
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
  urls: string[];
  fileContext?: FileReadContext;
}): Promise<
  {
    success: boolean;
    name: string;
    url: string;
  }[]
> => {
  const parseUrlList = urls
    .map((url) => normalizeReadableFileUrl({ url, requestOrigin, fileContext }))
    .filter(Boolean)
    .slice(0, maxFiles);

  const readFilesResult = await Promise.all(
    parseUrlList
      .map(async (url) => {
        // Get from buffer
        const sourceId = fileContext?.getIdentity(url) ?? url;
        const rawTextBuffer = await getS3RawTextSource().getRawTextBuffer({
          sourceId,
          customPdfParse: false
        });
        if (rawTextBuffer) {
          return {
            success: true,
            name: rawTextBuffer.filename,
            url
          };
        }

        try {
          if (!fileContext?.resolve(url) && (await isInternalAddress(url))) {
            return {
              success: false,
              name: '',
              url
            };
          }

          const { filename } = await getFileInfoFromUrl({ teamId, url, fileContext });

          return { success: true, name: filename, url };
        } catch {
          return {
            success: false,
            name: '',
            url
          };
        }
      })
      .filter(Boolean)
  );

  return readFilesResult;
};
