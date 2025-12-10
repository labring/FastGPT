import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { serverRequestBaseUrl } from '../../../../common/api/serverRequest';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { detectFileEncoding, parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { readS3FileContentByBuffer } from '../../../../common/file/read/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { addLog } from '../../../../common/system/log';
import { addDays } from 'date-fns';
import { getNodeErrResponse } from '../utils';
import { isInternalAddress } from '../../../../common/system/utils';
import { replaceS3KeyToPreviewUrl } from '../../../dataset/utils';
import { getFileS3Key } from '../../../../common/s3/utils';
import { S3ChatSource } from '../../../../common/s3/sources/chat';
import path from 'node:path';
import { S3Buckets } from '../../../../common/s3/constants';
import { S3Sources } from '../../../../common/s3/type';
import { getS3RawTextSource } from '../../../../common/s3/sources/rawText';

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

export const getHistoryFileLinks = (histories: ChatItemType[]) => {
  return histories
    .filter((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.filter((value) => value.type === 'file');
      }
      return false;
    })
    .map((item) => {
      const value = item.value as UserChatItemValueItemType[];
      const files = value
        .map((item) => {
          return item.file?.url;
        })
        .filter(Boolean) as string[];
      return files;
    })
    .flat();
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
  const parseUrlList = urls
    // Remove invalid urls
    .filter((url) => {
      if (typeof url !== 'string') return false;

      // 检查相对路径
      const validPrefixList = ['/', 'http', 'ws'];
      if (validPrefixList.some((prefix) => url.startsWith(prefix))) {
        return true;
      }

      return false;
    })
    // Just get the document type file
    .filter((url) => parseUrlToFileType(url)?.type === 'file')
    .map((url) => {
      try {
        // Check is system upload file
        const parsedURL = new URL(url, 'http://localhost:3000');
        if (requestOrigin && parsedURL.origin === requestOrigin) {
          url = url.replace(requestOrigin, '');
        }

        return url;
      } catch (error) {
        addLog.warn(`Parse url error`, { error });
        return '';
      }
    })
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
          return formatResponseObject({
            filename: rawTextBuffer.filename || url,
            url,
            content: rawTextBuffer.text
          });
        }

        try {
          if (isInternalAddress(url)) {
            return Promise.reject('Url is invalid');
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

              // Priority: filename* (RFC 5987, UTF-8 encoded) > filename (traditional)
              const extractFilename = (contentDisposition: string): string => {
                // Try RFC 5987 filename* first (e.g., filename*=UTF-8''encoded-name)
                const filenameStarRegex = /filename\*=([^']*)'([^']*)'([^;\n]*)/i;
                const starMatches = filenameStarRegex.exec(contentDisposition);
                if (starMatches && starMatches[3]) {
                  const charset = starMatches[1].toLowerCase();
                  const encodedFilename = starMatches[3];
                  // Decode percent-encoded UTF-8 filename
                  try {
                    return decodeURIComponent(encodedFilename);
                  } catch (error) {
                    addLog.warn('Failed to decode filename*', { encodedFilename, error });
                  }
                }

                // Fallback to traditional filename parameter
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches && matches[1]) {
                  return matches[1].replace(/['"]/g, '');
                }

                return '';
              };

              const matchFilename = extractFilename(contentDisposition);
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

          const { rawText } = await readS3FileContentByBuffer({
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
