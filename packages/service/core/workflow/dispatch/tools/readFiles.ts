import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { documentFileType } from '@fastgpt/global/common/file/constants';
import axios from 'axios';
import { serverRequestBaseUrl } from '../../../../common/api/serverRequest';
import { MongoRawTextBuffer } from '../../../../common/buffer/rawText/schema';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { readRawContentByFileBuffer } from '../../../../common/file/read/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.fileUrlList]: string[];
}>;
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.text]: string;
}>;

const formatResponseObject = (filename: string, content: string) => ({
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
    teamId,
    params: { fileUrlList = [] }
  } = props;

  const bufferResult = await Promise.all(
    fileUrlList
      .map(async (url) => {
        // System file
        if (url.startsWith('/') || (requestOrigin && url.startsWith(requestOrigin))) {
          // Parse url, get filename query. Keep only documents that can be parsed
          const parseUrl = new URL(url);
          const filenameQuery = parseUrl.searchParams.get('filename');
          if (filenameQuery) {
            const extensionQuery = filenameQuery.split('.').pop()?.toLowerCase() || '';
            if (!documentFileType.includes(extensionQuery)) {
              return;
            }
          }

          //  Remove the origin(Make intranet requests directly)
          if (requestOrigin && url.startsWith(requestOrigin)) {
            url = url.replace(requestOrigin, '');
          }
        }

        // Get from buffer
        const fileBuffer = await MongoRawTextBuffer.findOne({ sourceId: url }, undefined, {
          ...readFromSecondary
        }).lean();
        if (fileBuffer) {
          return formatResponseObject(fileBuffer.metadata?.filename || url, fileBuffer.rawText);
        }

        try {
          // Get file buffer
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
          const extension = filename.split('.').pop()?.toLowerCase() || '';
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
            isQAImport: false,
            teamId,
            buffer,
            encoding
          });

          // Add to buffer
          try {
            if (buffer.length < 14 * 1024 * 1024 && rawText.trim()) {
              MongoRawTextBuffer.create({
                sourceId: url,
                rawText,
                metadata: {
                  filename: filename
                }
              });
            }
          } catch (error) {}

          return formatResponseObject(filename, rawText);
        } catch (error) {
          return formatResponseObject(url, getErrText(error, 'Load file error'));
        }
      })
      .filter(Boolean)
  );
  const text = bufferResult.map((item) => item?.text ?? '').join('\n******\n');

  return {
    [NodeOutputKeyEnum.text]: text,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      textOutput: bufferResult.map((item) => item?.nodeResponsePreviewText ?? '').join('\n******\n')
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: {
      fileContent: text
    }
  };
};
