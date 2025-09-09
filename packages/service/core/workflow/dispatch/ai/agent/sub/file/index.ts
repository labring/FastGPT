import {
  addRawTextBuffer,
  getRawTextBuffer
} from '../../../../../../../common/buffer/rawText/controller';
import type { DispatchSubAppResponse } from '../../type';
import { isInternalAddress } from '../../../../../../../common/system/utils';
import axios from 'axios';
import { serverRequestBaseUrl } from '../../../../../../../common/api/serverRequest';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { readRawContentByFileBuffer } from '../../../../../../../common/file/read/utils';
import { addMinutes } from 'date-fns';
import { getErrText } from '@fastgpt/global/common/error/utils';

type FileReadParams = {
  files: { index: string; url: string }[];

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
  const readFilesResult = await Promise.all(
    files.map(async ({ index, url }) => {
      // Get from buffer
      const fileBuffer = await getRawTextBuffer(url);
      if (fileBuffer) {
        return {
          index,
          name: fileBuffer.sourceName,
          content: fileBuffer.text
        };
      }

      try {
        if (isInternalAddress(url)) {
          return {
            index,
            name: '',
            content: Promise.reject('Url is invalid')
          };
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

        return {
          index,
          name: filename,
          content: rawText
        };
      } catch (error) {
        return {
          index,
          name: '',
          content: getErrText(error, 'Load file error')
        };
      }
    })
  );

  return {
    response: JSON.stringify(readFilesResult),
    usages: []
  };
};
