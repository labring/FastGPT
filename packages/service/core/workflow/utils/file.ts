import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { parseUrlToFileType } from './context';
import { getS3RawTextSource } from '../../../common/s3/sources/rawText';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../../../common/system/utils';
import { axios } from '../../../common/api/axios';
import { serverRequestBaseUrl } from '../../../common/api/serverRequest';
import { S3Buckets } from '../../../common/s3/config/constants';
import { S3Sources } from '../../../common/s3/contracts/type';
import {
  detectFileEncoding,
  parseContentDispositionFilename
} from '@fastgpt/global/common/file/tools';
import path from 'path';
import { getFileS3Key } from '../../../common/s3/utils';
import { S3ChatSource } from '../../../common/s3/sources/chat';
import { readFileContentByBuffer } from '../../../common/file/read/utils';
import { addDays } from 'date-fns';
import { replaceS3KeyToPreviewUrl } from '../../dataset/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getUserFilesPrompt, injectUserQueryPrompt } from '../../ai/llm/agentLoop/prompt';

type GetFileProps = {
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  teamId: string;
  tmbId: string;
  usageId?: string;
};

export const rewriteUserQueryWithFiles = async ({
  queryId,
  userQuery,
  requestOrigin,
  maxFiles,
  customPdfParse,
  teamId,
  tmbId,
  usageId
}: GetFileProps & {
  queryId: string;
  userQuery: UserChatItemValueItemType[];
}) => {
  const urls = userQuery
    .map((item) => (item.file?.type === ChatFileTypeEnum.file ? item.file.url : ''))
    .filter(Boolean);

  if (urls.length === 0) {
    return userQuery;
  }

  const readFilesResult = await getFileContentFromLinks({
    urls,
    requestOrigin,
    maxFiles,
    teamId,
    tmbId,
    customPdfParse,
    usageId
  });

  if (readFilesResult.length === 0) {
    return userQuery;
  }

  const files = readFilesResult.map((item, index) => ({
    id: `${queryId}-${index}`,
    name: item.filename,
    content: item.content
  }));

  // 把 file 和 text 合并成一个 text(实际上应该只会有一个 text+多个 files)
  const text = userQuery.find((item) => item.text?.content)?.text?.content;
  const fileQuery = getUserFilesPrompt(files);

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
 * 格式化文件 URL，移除请求头部分，只保留文件 URL
 */
export const normalizeReadableFileUrl = ({
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

  if (parseUrlToFileType(normalizedUrl)?.type !== ChatFileTypeEnum.file) {
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

export const getFileContentFromLinks = async ({
  urls,
  requestOrigin,
  maxFiles,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: GetFileProps & {
  urls: string[];
}) => {
  const parseUrlList = urls
    .map((url) => normalizeReadableFileUrl({ url, requestOrigin }))
    .filter(Boolean)
    .slice(0, maxFiles);

  const readFilesResult = await Promise.all(
    parseUrlList
      .map(async (url) => {
        // Get from buffer
        const rawTextBuffer = await getS3RawTextSource().getRawTextBuffer({
          sourceId: url,
          customPdfParse
        });
        if (rawTextBuffer) {
          return {
            success: true,
            filename: rawTextBuffer.filename,
            url,
            content: rawTextBuffer.text
          };
        }

        try {
          if (await isInternalAddress(url)) {
            return Promise.reject(PRIVATE_URL_TEXT);
          }

          // Get file buffer data
          const response = await axios.get(url, {
            baseURL: serverRequestBaseUrl,
            responseType: 'arraybuffer'
          });

          const buffer = Buffer.from(response.data, 'binary');

          const urlObj = new URL(url, 'http://localhost:3000');
          const isChatExternalUrl = !urlObj.pathname.startsWith(
            `/${S3Buckets.private}/${S3Sources.chat}/`
          );

          // Get file name
          const { filename, extension, imageParsePrefix } = (() => {
            if (isChatExternalUrl) {
              const contentDisposition = response.headers['content-disposition'] || '';
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

          // Get encoding
          const encoding = (() => {
            const contentType = response.headers['content-type'];
            if (contentType) {
              const charsetRegex = /charset=([^;]*)/;
              const matches = charsetRegex.exec(contentType);
              if (matches != null && matches[1]) {
                return matches[1];
              }
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
                  // 聊天对话里面上传的外部链接，解析出来的图片过期时间设置为1天，而且是存储在临时文件夹的
                  expiredTime: isChatExternalUrl ? addDays(new Date(), 1) : undefined
                }
              : undefined,
            usageId
          });

          const replacedText = replaceS3KeyToPreviewUrl(rawText, addDays(new Date(), 90));

          // Add to buffer
          getS3RawTextSource().addRawTextBuffer({
            sourceId: url,
            sourceName: filename,
            text: replacedText,
            customPdfParse
          });

          return { success: true, filename, url, content: replacedText };
        } catch (error) {
          return {
            success: false,
            filename: '',
            url,
            content: getErrText(error, 'Load file error')
          };
        }
      })
      .filter(Boolean)
  );

  return readFilesResult;
};
