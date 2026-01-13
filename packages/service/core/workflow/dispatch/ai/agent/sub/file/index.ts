import type { DispatchSubAppResponse } from '../../type';
import { isInternalAddress } from '../../../../../../../common/system/utils';
import axios from 'axios';
import { serverRequestBaseUrl } from '../../../../../../../common/api/serverRequest';
import { parseFileExtensionFromUrl } from '@fastgpt/global/common/string/tools';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { getS3RawTextSource } from '../../../../../../../common/s3/sources/rawText/index';
import { readFileContentByBuffer } from '../../../../../../../common/file/read/utils';
import { getLLMModel } from '../../../../../../ai/model';
import { compressLargeContent } from '../../../../../../ai/llm/compress';
import { calculateCompressionThresholds } from '../../../../../../ai/llm/compress/constants';
import { addLog } from '../../../../../../../common/system/log';

type FileReadParams = {
  files: { index: string; url: string }[];

  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  model: string;
};

export const dispatchFileRead = async ({
  files,
  teamId,
  tmbId,
  customPdfParse,
  model
}: FileReadParams): Promise<DispatchSubAppResponse> => {
  const readFilesResult = await Promise.all(
    files.map(async ({ index, url }) => {
      // Get from buffer
      const fileBuffer = await getS3RawTextSource().getRawTextBuffer({
        sourceId: url,
        customPdfParse
      });
      if (fileBuffer) {
        return {
          index,
          name: fileBuffer.filename,
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

  // Stringify the result
  let responseText = JSON.stringify(readFilesResult);

  // Check if compression is needed
  const llmModel = getLLMModel(model);
  const thresholds = calculateCompressionThresholds(llmModel.maxContext);
  // const maxTokens = thresholds.fileReadResponse.threshold;
  // Test
  const maxTokens = 10000;

  addLog.debug('[File Read] Checking if compression needed', {
    contentLength: responseText.length,
    maxTokens,
    model: llmModel.model
  });

  // Compress if content exceeds threshold
  try {
    responseText = await compressLargeContent({
      content: responseText,
      model: llmModel,
      maxTokens
    });

    addLog.info('[File Read] Compression complete', {
      originalLength: JSON.stringify(readFilesResult).length,
      compressedLength: responseText.length,
      compressionRatio: (responseText.length / JSON.stringify(readFilesResult).length).toFixed(2)
    });
  } catch (error) {
    addLog.error('[File Read] Compression failed, using original content', error);
  }

  return {
    response: responseText,
    usages: []
  };
};
