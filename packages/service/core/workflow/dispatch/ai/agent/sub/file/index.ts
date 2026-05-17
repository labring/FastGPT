import { isInternalAddress, PRIVATE_URL_TEXT } from '../../../../../../../common/system/utils';
import { pickOutboundAxios } from '../../../../../../../common/api/axios';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import {
  detectFileEncoding,
  parseContentDispositionFilename
} from '@fastgpt/global/common/file/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getS3RawTextSource } from '../../../../../../../common/s3/sources/rawText/index';
import { readFileContentByBuffer } from '../../../../../../../common/file/read/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getAxiosHeaderValue } from '@fastgpt/global/common/axios/utils';
import type { DispatchSubAppResponse } from '../../type';

type FileReadParams = {
  files: { id: string; url: string }[];

  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
};

export const dispatchFileRead = async ({
  files,
  teamId,
  tmbId,
  customPdfParse
}: FileReadParams): Promise<DispatchSubAppResponse> => {
  try {
    const readFilesResult = await Promise.all(
      files.map(async ({ id, url }) => {
        // Get from buffer
        const fileBuffer = await getS3RawTextSource().getRawTextBuffer({
          sourceId: url,
          customPdfParse
        });
        if (fileBuffer) {
          return {
            id,
            name: fileBuffer.filename,
            content: fileBuffer.text
          };
        }

        try {
          if (await isInternalAddress(url)) {
            return {
              id,
              name: '',
              content: PRIVATE_URL_TEXT
            };
          }
          const response = await pickOutboundAxios(url).get(url, {
            responseType: 'arraybuffer'
          });

          const buffer = Buffer.from(response.data, 'binary');

          // Get file name
          const filename = (() => {
            const contentDisposition = getAxiosHeaderValue(response.headers['content-disposition']);
            return parseContentDispositionFilename(contentDisposition) || url;
          })();
          // Extension
          const extension = parseFileExtensionFromUrl(filename);

          // Get encoding
          const encoding = (() => {
            const contentType = getAxiosHeaderValue(response.headers['content-type']);
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
          const { rawText } = await readFileContentByBuffer({
            extension,
            teamId,
            tmbId,
            buffer,
            encoding,
            customPdfParse,
            getFormatText: true
          });

          // Add to buffer
          getS3RawTextSource().addRawTextBuffer({
            sourceId: url,
            sourceName: filename,
            text: rawText,
            customPdfParse
          });

          return {
            id,
            name: filename,
            content: rawText
          };
        } catch (error) {
          return {
            id,
            name: '',
            content: getErrText(error, 'Load file error')
          };
        }
      })
    );

    return {
      response: JSON.stringify(readFilesResult),
      usages: [],
      nodeResponse: {
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: i18nT('chat:read_file')
      }
    };
  } catch (error) {
    return {
      response: `Failed to read file: ${getErrText(error)}`,
      usages: []
    };
  }
};
