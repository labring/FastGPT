import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  detectFileEncoding,
  parseContentDispositionFilename
} from '@fastgpt/global/common/file/tools';
import { getUserFilesPrompt, injectUserQueryPrompt } from '../llm/prompt';
import { getS3RawTextSource } from '../../../common/s3/sources/rawText';
import { S3Buckets } from '../../../common/s3/config/constants';
import { S3Sources } from '../../../common/s3/contracts/type';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../../../common/system/utils';
import { pickOutboundAxios } from '../../../common/api/axios';
import { readFileContentByBuffer } from '../../../common/file/read/utils';
import { replaceS3KeyToPreviewUrl } from '../../dataset/utils';
import { addDays } from 'date-fns';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';
import { getFileS3Key } from '../../../common/s3/utils';
import { S3ChatSource } from '../../../common/s3/sources/chat';
import path from 'path';

type ParseFileContentParams = {
  urls: string[];
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
};

const normalizeReadableFileUrl = ({
  url,
  requestOrigin
}: {
  url?: string;
  requestOrigin?: string;
}) => {
  if (typeof url !== 'string') return '';

  let normalizedUrl = url.trim();
  if (!normalizedUrl) return '';

  const validPrefixList = ['/', 'http', 'ws'];
  if (!validPrefixList.some((prefix) => normalizedUrl.startsWith(prefix))) {
    return '';
  }

  try {
    const parsedURL = new URL(normalizedUrl, 'http://localhost:3000');
    if (requestOrigin && parsedURL.origin === requestOrigin) {
      normalizedUrl = normalizedUrl.replace(requestOrigin, '');
    }

    return normalizedUrl;
  } catch {
    return '';
  }
};

const getFileInfoFromUrl = async ({ teamId, url }: { teamId: string; url: string }) => {
  const response = await pickOutboundAxios(url).get(url, {
    responseType: 'arraybuffer'
  });

  const urlObj = new URL(url, 'http://localhost:3000');
  const isChatExternalUrl = !urlObj.pathname.startsWith(`/${S3Buckets.private}/${S3Sources.chat}/`);
  const { filename, extension, imageParsePrefix } = (() => {
    if (isChatExternalUrl) {
      const contentDisposition = getAxiosHeaderValue(response.headers['content-disposition']) || '';
      const matchFilename = parseContentDispositionFilename(contentDisposition);
      const filename = matchFilename || urlObj.pathname.split('/').pop() || 'file';
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
    contentType: getAxiosHeaderValue(response.headers['content-type']),
    stream: response.data
  };
};

const getFileContentByUrl = async ({
  url,
  teamId,
  tmbId,
  customPdfParse
}: Omit<ParseFileContentParams, 'urls' | 'requestOrigin' | 'maxFiles'> & {
  url: string;
}) => {
  const rawTextBuffer = await getS3RawTextSource().getRawTextBuffer({
    sourceId: url,
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
    await getFileInfoFromUrl({ teamId, url });
  const buffer = Buffer.from(stream, 'binary');
  const encoding = (() => {
    if (contentType) {
      const matches = /charset=([^;]*)/.exec(contentType);
      if (matches?.[1]) return matches[1];
    }
    return detectFileEncoding(buffer);
  })();

  const { rawText } = await readFileContentByBuffer({
    extension,
    teamId,
    tmbId,
    buffer,
    encoding,
    customPdfParse,
    getFormatText: true,
    imageKeyOptions: imageParsePrefix
      ? {
          prefix: imageParsePrefix,
          expiredTime: isChatExternalUrl ? addDays(new Date(), 1) : undefined
        }
      : undefined
  });
  const replacedText = replaceS3KeyToPreviewUrl(rawText, addDays(new Date(), 90));

  getS3RawTextSource().addRawTextBuffer({
    sourceId: url,
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

const parseFileContentFromUrls = async ({
  urls,
  requestOrigin,
  maxFiles,
  teamId,
  tmbId,
  customPdfParse
}: ParseFileContentParams) => {
  const parseUrlList = urls
    .map((url) => normalizeReadableFileUrl({ url, requestOrigin }))
    .filter(Boolean)
    .slice(0, maxFiles);

  return Promise.all(
    parseUrlList.map(async (url) => {
      try {
        if (await isInternalAddress(url)) {
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
          customPdfParse
        });

        return { success: true, name, url, content };
      } catch (error) {
        return {
          success: false,
          name: '',
          url,
          content: getErrText(error, 'Load file error')
        };
      }
    })
  );
};

const formatUserQueryWithFiles = async ({
  userQuery,
  parseFileFn
}: {
  userQuery: UserChatItemValueItemType[];
  parseFileFn: (urls: string[]) => Promise<{ name: string; url: string; content?: string }[]>;
}): Promise<UserChatItemValueItemType[]> => {
  const urls = userQuery
    .map((item) => (item.file?.type === ChatFileTypeEnum.file ? item.file.url : ''))
    .filter(Boolean);

  if (urls.length === 0) {
    return userQuery;
  }

  const readFilesResult = await parseFileFn(urls);
  if (readFilesResult.length === 0) {
    return userQuery;
  }

  const text = userQuery.find((item) => item.text?.content)?.text?.content;
  const fileQuery = getUserFilesPrompt(readFilesResult);

  return [
    {
      text: {
        content: injectUserQueryPrompt({
          query: text,
          filePrompt: fileQuery
        })
      }
    }
  ];
};

/**
 * 将辅助生成消息中的普通文件解析为文本上下文。
 *
 * 当前 helper 只解析本轮用户上传的文件；历史文件不回放，避免旧文件在多轮辅助生成中重复计费。
 */
export const rewriteAuxiliaryGenerationMessageFiles = async ({
  messages,
  requestOrigin,
  maxFiles,
  teamId,
  tmbId,
  customPdfParse
}: {
  messages: ChatItemMiniType[];
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
}) => {
  return Promise.all(
    messages.map(async (message, index): Promise<ChatItemMiniType> => {
      if (message.obj !== ChatRoleEnum.Human) {
        return message;
      }

      const isCurrentUserMessage = index === messages.length - 1;
      if (!isCurrentUserMessage) {
        return {
          ...message,
          value: message.value.filter((item) => !item.file)
        };
      }

      const query = await formatUserQueryWithFiles({
        userQuery: message.value,
        parseFileFn: async (urls) => {
          const parsedFiles = await parseFileContentFromUrls({
            urls,
            requestOrigin,
            maxFiles,
            teamId,
            tmbId,
            customPdfParse
          });

          return parsedFiles.map((file) => ({
            name: file.name,
            url: file.url,
            content: file.content
          }));
        }
      });

      return {
        ...message,
        value: query
      };
    })
  );
};
