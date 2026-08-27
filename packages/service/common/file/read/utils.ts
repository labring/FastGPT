import FormData from 'form-data';
import fs from 'fs';
import type { ReadFileResponse } from '../../../worker/readFile/type';
import { axios } from '../../api/axios';
import { parseMarkdownBase64Images } from '@fastgpt/global/common/string/markdown';
import { createPdfParseUsage } from '../../../support/wallet/usage/controller';
import { useDoc2xServer } from '../../../thirdProvider/doc2x';
import { useTextinServer } from '../../../thirdProvider/textin';
import { useSomarkServer } from '../../../thirdProvider/somark';
import { readRawContentFromBuffer } from '../../../worker/function';
import { getLogger, LogCategories } from '../../logger';
import { getImageBuffer } from '../image/utils';
import { uploadParsedPdfImage } from './image';
import { getBackendFileOperationTimeoutMs } from '../parseTimeout';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);

export type readRawTextByLocalFileParams = {
  teamId: string;
  tmbId: string;
  path: string;
  encoding: string;
  customPdfParse?: boolean;
  getFormatText?: boolean;
  fileParsedPrefix?: string;
  metadata?: Record<string, any>;
};
export const readRawTextByLocalFile = async (params: readRawTextByLocalFileParams) => {
  const { path } = params;

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';
  const buffer = await fs.promises.readFile(path);

  return readFileContentByBuffer({
    extension,
    customPdfParse: params.customPdfParse,
    getFormatText: params.getFormatText,
    teamId: params.teamId,
    tmbId: params.tmbId,
    encoding: params.encoding,
    buffer,
    imageKeyOptions: params.fileParsedPrefix
      ? {
          prefix: params.fileParsedPrefix
        }
      : undefined
  });
};

export const readFileContentByBuffer = async ({
  teamId,
  tmbId,

  extension: rawExtension,
  buffer,
  encoding,
  customPdfParse = false,
  usageId,
  getFormatText = true,
  imageKeyOptions,
  onPdfParseUsage
}: {
  teamId: string;
  tmbId: string;

  extension: string;
  buffer: Buffer;
  encoding: string;

  customPdfParse?: boolean;
  usageId?: string;
  getFormatText?: boolean;
  imageKeyOptions?: {
    prefix: string;
    expiredTime?: Date;
  };
  /** 注入后由上层工作流归集增强解析费用；未注入时保持原有的独立落账行为。 */
  onPdfParseUsage?: (usage: ChatNodeUsageType) => void;
}): Promise<Pick<ReadFileResponse, 'rawText' | 'tableInfo'>> => {
  // 归一化扩展名为小写，避免大写/混合大小写后缀（如 .PDF）无法匹配解析器（#6996）
  const extension = rawExtension.toLowerCase();

  const parseMarkdownImages = (rawText: string) =>
    parseMarkdownBase64Images(rawText, {
      parseBase64: true,
      parseHttp: true,
      controller: imageKeyOptions?.prefix
        ? async (image) => {
            if (image.type === 'base64') {
              return uploadParsedPdfImage(
                {
                  type: 'base64',
                  mime: image.mime,
                  dataUrl: image.dataUrl
                },
                imageKeyOptions
              );
            }

            const { buffer, mime } = await getImageBuffer(image.url);
            return uploadParsedPdfImage(
              {
                type: 'http',
                mime,
                buffer
              },
              imageKeyOptions
            );
          }
        : undefined
    });

  const systemParse = () =>
    readRawContentFromBuffer({
      extension,
      encoding,
      buffer,
      imageKeyOptions
    });

  const reportPdfParseUsage = (pages: number) => {
    if (onPdfParseUsage) {
      onPdfParseUsage({
        moduleName: i18nT('account_usage:pdf_enhanced_parse'),
        totalPoints: pages * (global.systemEnv?.customPdfParse?.price || 0),
        pages
      });
      return;
    }

    createPdfParseUsage({
      teamId,
      tmbId,
      pages,
      usageId
    });
  };
  const parsePdfFromCustomService = async (): Promise<ReadFileResponse> => {
    const url = global.systemEnv.customPdfParse?.url;
    const token = global.systemEnv.customPdfParse?.key;
    if (!url) return systemParse();

    const start = Date.now();
    logger.info('Start parsing file via external service', { extension });

    const data = new FormData();
    data.append('file', buffer, {
      filename: `file.${extension}`
    });
    const { data: response } = await axios.post<{
      pages: number;
      markdown: string;
      error?: object | string;
    }>(url, data, {
      timeout: getBackendFileOperationTimeoutMs(),
      headers: {
        ...data.getHeaders(),
        Authorization: token ? `Bearer ${token}` : undefined
      }
    });

    if (response.error) {
      return Promise.reject(response.error);
    }

    logger.info('External file parsing completed', {
      extension,
      durationMs: Date.now() - start
    });

    const text = await parseMarkdownImages(response.markdown);

    reportPdfParseUsage(response.pages);

    return {
      rawText: text,
      formatText: text
    };
  };
  const parsePdfFromSomark = async (): Promise<ReadFileResponse> => {
    const apiKey = global.systemEnv.customPdfParse?.somarkApiKey;
    if (!apiKey) return systemParse();

    const { pages, text: rawText } = await useSomarkServer({ apiKey }).parsePDF(buffer);
    const text = await parseMarkdownImages(rawText);

    reportPdfParseUsage(pages);

    return {
      rawText: text,
      formatText: text
    };
  };
  // Textin api
  const parsePdfFromTextin = async (): Promise<ReadFileResponse> => {
    const appId = global.systemEnv.customPdfParse?.textinAppId;
    const secretCode = global.systemEnv.customPdfParse?.textinSecretCode;
    if (!appId || !secretCode) return systemParse();

    const { pages, text } = await useTextinServer({
      appId,
      secretCode
    }).parsePDF(buffer, {
      uploadImage: imageKeyOptions?.prefix
        ? async (image) =>
            uploadParsedPdfImage(
              image.type === 'base64'
                ? {
                    type: 'base64',
                    mime: image.mime,
                    dataUrl: image.dataUrl
                  }
                : {
                    type: 'http',
                    mime: image.mime,
                    buffer: image.buffer
                  },
              imageKeyOptions
            )
        : undefined
    });

    reportPdfParseUsage(pages);

    return {
      rawText: text,
      formatText: text
    };
  };
  // Doc2x api
  const parsePdfFromDoc2x = async (): Promise<ReadFileResponse> => {
    const doc2xKey = global.systemEnv.customPdfParse?.doc2xKey;
    if (!doc2xKey) return systemParse();

    const { pages, text } = await useDoc2xServer({ apiKey: doc2xKey }).parsePDF(buffer, {
      uploadImage: imageKeyOptions?.prefix
        ? async (image) =>
            uploadParsedPdfImage(
              image.type === 'base64'
                ? {
                    type: 'base64',
                    mime: image.mime,
                    dataUrl: image.dataUrl
                  }
                : {
                    type: 'http',
                    mime: image.mime,
                    buffer: image.buffer
                  },
              imageKeyOptions
            )
        : undefined
    });

    reportPdfParseUsage(pages);

    return {
      rawText: text,
      formatText: text
    };
  };
  // Custom read file service
  const pdfParseFn = async (): Promise<ReadFileResponse> => {
    if (!customPdfParse) return systemParse();
    if (global.systemEnv.customPdfParse?.url) return parsePdfFromCustomService();
    if (global.systemEnv.customPdfParse?.somarkApiKey) return parsePdfFromSomark();
    if (global.systemEnv.customPdfParse?.textinAppId) return parsePdfFromTextin();
    if (global.systemEnv.customPdfParse?.doc2xKey) return parsePdfFromDoc2x();

    return systemParse();
  };

  const start = Date.now();
  logger.debug('Start parsing file', { extension });

  const { rawText, formatText, tableInfo } = await (async () => {
    if (extension === 'pdf') {
      return await pdfParseFn();
    }
    return await systemParse();
  })();

  logger.debug('File parsing completed', { extension, durationMs: Date.now() - start });

  return {
    rawText: getFormatText ? formatText || rawText : rawText,
    tableInfo
  };
};
