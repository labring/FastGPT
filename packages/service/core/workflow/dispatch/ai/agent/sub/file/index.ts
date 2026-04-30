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
import { getLLMModel } from '../../../../../../ai/model';
import { compressLargeContent } from '../../../../../../ai/llm/compress';
import { calculateCompressionThresholds } from '../../../../../../ai/llm/compress/constants';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { i18nT } from '../../../../../../../../web/i18n/utils';
import { getLogger, LogCategories } from '../../../../../../../common/logger';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { DispatchSubAppResponse } from '../../type';

type FileReadParams = {
  files: { index: string; url: string }[];

  teamId: string;
  tmbId: string;
  customPdfParse?: boolean;
  model: string;
  userKey?: OpenaiAccountType;
};

export const dispatchFileRead = async ({
  files,
  teamId,
  tmbId,
  customPdfParse,
  model,
  userKey
}: FileReadParams): Promise<DispatchSubAppResponse> => {
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
          if (await isInternalAddress(url)) {
            return {
              index,
              name: '',
              content: Promise.reject(PRIVATE_URL_TEXT)
            };
          }
          const response = await pickOutboundAxios(url).get(url, {
            responseType: 'arraybuffer'
          });

          const buffer = Buffer.from(response.data, 'binary');

          // Get file name
          const filename = (() => {
            const contentDisposition = response.headers['content-disposition'];
            return parseContentDispositionFilename(contentDisposition) || url;
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
      maxTokens,
      userKey
    });

    responseText = result.compressed;
    if (result.usage) {
      usages.push(result.usage);
    }

    getLogger(LogCategories.MODULE.AI.AGENT).info('[File Read] Compression complete', {
      originalLength: JSON.stringify(readFilesResult).length,
      compressedLength: responseText.length,
      compressionRatio: (responseText.length / JSON.stringify(readFilesResult).length).toFixed(2)
    });

    return {
      response: responseText,
      usages,
      nodeResponse: {
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: i18nT('chat:read_file'),
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
    getLogger(LogCategories.MODULE.AI.AGENT).error(
      '[File Read] Compression failed, using original content',
      { error }
    );
    return {
      response: `Failed to read file: ${getErrText(error)}`,
      usages: []
    };
  }
};
