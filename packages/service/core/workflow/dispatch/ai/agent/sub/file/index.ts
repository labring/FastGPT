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
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../../../../web/i18n/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

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
}: FileReadParams): Promise<{
  response: string;
  usages: ChatNodeUsageType[];
  nodeResponse?: ChatHistoryItemResType;
}> => {
  const startTime = Date.now();
  try {
    const usages: ChatNodeUsageType[] = [];
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
    const maxTokens = thresholds.fileReadResponse.threshold;

    const result = await compressLargeContent({
      content: responseText,
      model: llmModel,
      maxTokens
    });

    responseText = result.compressed;
    if (result.usage) {
      usages.push(result.usage);
    }

    addLog.info('[File Read] Compression complete', {
      originalLength: JSON.stringify(readFilesResult).length,
      compressedLength: responseText.length,
      compressionRatio: (responseText.length / JSON.stringify(readFilesResult).length).toFixed(2)
    });

    return {
      response: responseText,
      usages,
      nodeResponse: {
        nodeId: getNanoid(6),
        id: getNanoid(6),
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: i18nT('chat:read_file'),
        totalPoints: usages.reduce((acc, item) => acc + item.totalPoints, 0),
        runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
        compressTextAgent: result.usage
          ? {
              inputTokens: result.usage.inputTokens || 0,
              outputTokens: result.usage.outputTokens || 0,
              totalPoints: result.usage.totalPoints || 0
            }
          : undefined
      }
    };
  } catch (error) {
    addLog.error('[File Read] Compression failed, using original content', error);
    return {
      response: `Failed to read file: ${getErrText(error)}`,
      usages: []
    };
  }
};
