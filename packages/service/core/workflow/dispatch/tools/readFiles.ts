import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { serverRequestBaseUrl } from '../../../../common/api/serverRequest';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { detectFileEncoding, parseUrlToFileType } from '@fastgpt/global/common/file/tools';
import { readRawContentByFileBuffer } from '../../../../common/file/read/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../../../common/system/log';
import { addRawTextBuffer, getRawTextBuffer } from '../../../../common/buffer/rawText/controller';
import { addMinutes } from 'date-fns';
import { getNodeErrResponse } from '../utils';
import { isInternalAddress } from '../../../../common/system/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.fileUrlList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
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
    params: { fileUrlList = [] }
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
      customPdfParse
    });

    return {
      data: {
        [NodeOutputKeyEnum.text]: text
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
  customPdfParse
}: {
  urls: string[];
  requestOrigin?: string;
  maxFiles: number;
  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
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
        if (url.startsWith('/') || (requestOrigin && url.startsWith(requestOrigin))) {
          //  Remove the origin(Make intranet requests directly)
          if (requestOrigin && url.startsWith(requestOrigin)) {
            url = url.replace(requestOrigin, '');
          }
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
        const fileBuffer = await getRawTextBuffer(url);
        if (fileBuffer) {
          return formatResponseObject({
            filename: fileBuffer.sourceName || url,
            url,
            content: fileBuffer.text
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

          // Get file name
          const filename = (() => {
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
              const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
              const matches = filenameRegex.exec(contentDisposition);
              if (matches != null && matches[1]) {
                return decodeURIComponent(matches[1].replace(/['"]/g, ''));
              }
            }

            return url;
          })();
          // Extension
          const extension = parseFileExtensionFromUrl(filename);

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

          // Read file
          const { rawText } = await readRawContentByFileBuffer({
            extension,
            teamId,
            tmbId,
            buffer,
            encoding,
            customPdfParse,
            getFormatText: true
          });

          // Add to buffer
          addRawTextBuffer({
            sourceId: url,
            sourceName: filename,
            text: rawText,
            expiredTime: addMinutes(new Date(), 20)
          });

          return formatResponseObject({ filename, url, content: rawText });
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
