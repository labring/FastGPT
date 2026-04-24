import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { axios } from '../../../../common/api/axios';
import { serverRequestBaseUrl } from '../../../../common/api/serverRequest';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  detectFileEncoding,
  parseContentDispositionFilename
} from '@fastgpt/global/common/file/tools';
import { parseUrlToFileType } from '../../utils/context';
import { readFileContentByBuffer } from '../../../../common/file/read/utils';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { addDays } from 'date-fns';
import { getNodeErrResponse } from '../utils';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../../../../common/system/utils';
import { replaceS3KeyToPreviewUrl } from '../../../dataset/utils';
import { getFileS3Key } from '../../../../common/s3/utils';
import { S3ChatSource } from '../../../../common/s3/sources/chat';
import path from 'node:path';
import { S3Buckets } from '../../../../common/s3/config/constants';
import { S3Sources } from '../../../../common/s3/contracts/type';
import { getS3RawTextSource } from '../../../../common/s3/sources/rawText';
import { getLogger, LogCategories } from '../../../../common/logger';
import { replaceVariable } from '@fastgpt/global/common/string/tools';
import { getDocumentQuotePrompt } from '@fastgpt/global/core/ai/prompt/AIChat';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.TOOLS);

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.fileUrlList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
  [NodeOutputKeyEnum.rawResponse]: ReturnType<typeof formatResponseObject>[];
}>;

const formatResponseObject = ({
  filename,
  url,
  content
}: {
  filename: string;
  url: string;
  content: string;
}) => ({
  filename,
  url,
  text: `File: ${filename}
<Content>
${content}
</Content>`,
  nodeResponsePreviewText: `File: ${filename}
<Content>
${content.slice(0, 100)}${content.length > 100 ? '......' : ''}
</Content>`
});

export const dispatchReadFiles = async (props: Props): Promise<Response> => {
  const {
    requestOrigin,
    runningUserInfo: { teamId, tmbId },
    histories,
    chatConfig,
    node: { version },
    params: { fileUrlList = [] },
    usageId
  } = props;
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
  const customPdfParse = chatConfig?.fileSelectConfig?.customPdfParse || false;

  // Get files from histories
  const filesFromHistories = version !== '489' ? [] : getHistoryFileLinks(histories);

  try {
    const { text, readFilesResult } = await getFileContentFromLinks({
      // Concat fileUrlList and filesFromHistories; remove not supported files
      urls: [...fileUrlList, ...filesFromHistories],
      requestOrigin,
      maxFiles,
      teamId,
      tmbId,
      customPdfParse,
      usageId
    });

    return {
      data: {
        [NodeOutputKeyEnum.text]: text,
        [NodeOutputKeyEnum.rawResponse]: readFilesResult
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        readFiles: readFilesResult.map((item) => ({
          name: item?.filename || '',
          url: item?.url || ''
        })),
        readFilesResult: readFilesResult
          .map((item) => item?.nodeResponsePreviewText ?? '')
          .join('\n******\n')
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: {
        fileContent: text
      }
    };
  } catch (error) {
    return getNodeErrResponse({ error });
  }
};

export const getHistoryFileLinks = (histories: ChatItemMiniType[]) => {
  return histories
    .filter((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.some((value) => value.file);
      }
      return false;
    })
    .flatMap((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.map((value) => value.file?.url).filter(Boolean) as string[];
      }
      return [];
    });
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

  if (parseUrlToFileType(normalizedUrl)?.type !== 'file') {
    return '';
  }

  try {
    const parsedURL = new URL(normalizedUrl, 'http://localhost:3000');
    if (requestOrigin && parsedURL.origin === requestOrigin) {
      normalizedUrl = normalizedUrl.replace(requestOrigin, '');
    }

    return normalizedUrl;
  } catch (error) {
    logger.warn('Failed to parse file URL', { url: normalizedUrl, error });
    return '';
  }
};

const getReadableFileUrls = ({
  urls,
  requestOrigin,
  maxFiles
}: {
  urls: string[];
  requestOrigin?: string;
  maxFiles: number;
}) => {
  return urls
    .map((url) => normalizeReadableFileUrl({ url, requestOrigin }))
    .filter(Boolean)
    .slice(0, maxFiles);
};

export const injectFileContentToUserMessages = async ({
  messages,
  requestOrigin,
  maxFiles,
  customPdfParse,
  teamId,
  tmbId,
  usageId,
  version
}: {
  messages: ChatItemMiniType[];
  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  teamId: string;
  tmbId: string;
  usageId?: string;
  version?: string;
}) => {
  const urlToMessageIndexes = new Map<string, Set<number>>();

  messages.forEach((message, messageIndex) => {
    if (message.obj !== ChatRoleEnum.Human) return;

    message.value.forEach((item) => {
      if (item.file?.type !== ChatFileTypeEnum.file) return;

      const url = normalizeReadableFileUrl({
        url: item.file.url,
        requestOrigin
      });
      if (!url) return;

      const messageIndexes = urlToMessageIndexes.get(url) || new Set<number>();
      messageIndexes.add(messageIndex);
      urlToMessageIndexes.set(url, messageIndexes);
    });
  });

  const urls = Array.from(urlToMessageIndexes.keys()).slice(0, maxFiles);
  if (urls.length === 0) {
    return messages;
  }

  const { readFilesResult } = await getFileContentFromLinks({
    urls,
    requestOrigin,
    maxFiles,
    teamId,
    tmbId,
    customPdfParse,
    usageId
  });

  const fileTextsByMessageIndex = new Map<number, string[]>();
  readFilesResult.forEach((item) => {
    if (!item?.text) return;

    const messageIndexes = urlToMessageIndexes.get(item.url);
    if (!messageIndexes) return;

    messageIndexes.forEach((messageIndex) => {
      const fileTexts = fileTextsByMessageIndex.get(messageIndex) || [];
      fileTexts.push(item.text);
      fileTextsByMessageIndex.set(messageIndex, fileTexts);
    });
  });

  if (fileTextsByMessageIndex.size === 0) {
    return messages;
  }

  return messages.map((message, messageIndex) => {
    const fileTexts = fileTextsByMessageIndex.get(messageIndex);
    if (!fileTexts || message.obj !== ChatRoleEnum.Human) return message;

    const filePrompt = replaceVariable(getDocumentQuotePrompt(version), {
      quote: fileTexts.join('\n******\n')
    });
    if (!filePrompt) return message;

    const value = message.value.map((item) => {
      if (item.text) {
        return {
          ...item,
          text: {
            ...item.text
          }
        };
      }
      if (item.file) {
        return {
          ...item,
          file: {
            ...item.file
          }
        };
      }
      return { ...item };
    });

    const firstTextItem = value.find((item) => item.text);
    if (firstTextItem?.text) {
      firstTextItem.text.content = [firstTextItem.text.content, filePrompt]
        .filter(Boolean)
        .join('\n\n===---===---===\n\n');
    } else {
      value.push({
        text: {
          content: filePrompt
        }
      });
    }

    return {
      ...message,
      value
    };
  });
};

export const getFileContentFromLinks = async ({
  urls,
  requestOrigin,
  maxFiles,
  teamId,
  tmbId,
  customPdfParse,
  usageId
}: {
  urls: string[];
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  usageId?: string;
}) => {
  const parseUrlList = getReadableFileUrls({
    urls,
    requestOrigin,
    maxFiles
  });

  const readFilesResult = await Promise.all(
    parseUrlList
      .map(async (url) => {
        // Get from buffer
        const rawTextBuffer = await getS3RawTextSource().getRawTextBuffer({
          sourceId: url,
          customPdfParse
        });
        if (rawTextBuffer) {
          return formatResponseObject({
            filename: rawTextBuffer.filename || url,
            url,
            content: rawTextBuffer.text
          });
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

          return formatResponseObject({ filename, url, content: replacedText });
        } catch (error) {
          return formatResponseObject({
            filename: '',
            url,
            content: getErrText(error, 'Load file error')
          });
        }
      })
      .filter(Boolean)
  );
  const text = readFilesResult.map((item) => item?.text ?? '').join('\n******\n');

  return {
    text,
    readFilesResult
  };
};
