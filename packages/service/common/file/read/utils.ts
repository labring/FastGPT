import FormData from 'form-data';
import type { ReadFileResponse } from '../../../worker/readFile/type';
import { axios } from '../../api/axios';
import { parseMarkdownBase64Images } from '@fastgpt/global/common/string/markdown';
import { createPdfParseUsage } from '../../../support/wallet/usage/controller';
import { useDoc2xServer } from '../../../thirdProvider/doc2x';
import { useTextinServer } from '../../../thirdProvider/textin';
import { useSomarkServer } from '../../../thirdProvider/somark';
import { readRawContentFromBuffer, readRawContentFromSource } from '../../../worker/function';
import { getLogger, LogCategories } from '../../logger';
import { getImageBuffer } from '../image/utils';
import { uploadParsedPdfImage } from './image';
import { getBackendFileOperationTimeoutMs } from '../parseTimeout';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { FileSource } from './source';
import type { FileSourceMetadata } from './source';
import {
  materializeFileSource,
  resolveFileSourceDeclaredExtension,
  resolveFileSourceEncoding,
  resolveFileSourceExtension
} from './source';
import { serviceEnv } from '../../../env';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);

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
}): Promise<Pick<ReadFileResponse, 'rawText' | 'tableInfo' | 'sourceMetadata'>> =>
  readFileContent({
    teamId,
    tmbId,
    extension: rawExtension,
    buffer,
    encoding,
    customPdfParse,
    usageId,
    getFormatText,
    imageKeyOptions,
    onPdfParseUsage
  });

/**
 * 从轻量文件来源解析内容。系统解析会把 source 直接交给 worker pool，只有已确认启用的自定义 PDF
 * Provider 才在调用 Provider 前于主线程物化。
 */
export const readFileContentBySource = async ({
  teamId,
  tmbId,
  source,
  customPdfParse = false,
  usageId,
  getFormatText = true,
  imageKeyOptions,
  onPdfParseUsage
}: {
  teamId: string;
  tmbId: string;
  source: FileSource;
  customPdfParse?: boolean;
  usageId?: string;
  getFormatText?: boolean;
  imageKeyOptions?: {
    prefix: string;
    expiredTime?: Date;
  };
  onPdfParseUsage?: (usage: ChatNodeUsageType) => void;
}): Promise<Pick<ReadFileResponse, 'rawText' | 'tableInfo' | 'sourceMetadata'>> =>
  readFileContent({
    teamId,
    tmbId,
    extension: resolveFileSourceDeclaredExtension(source.metadata),
    source,
    encoding: source.metadata.encoding ?? '',
    customPdfParse,
    usageId,
    getFormatText,
    imageKeyOptions,
    onPdfParseUsage
  });

const readFileContent = async ({
  teamId,
  tmbId,
  extension: rawExtension,
  buffer: initialBuffer,
  source,
  encoding: initialEncoding,
  customPdfParse,
  usageId,
  getFormatText,
  imageKeyOptions,
  onPdfParseUsage
}: {
  teamId: string;
  tmbId: string;
  extension: string;
  buffer?: Buffer;
  source?: FileSource;
  encoding: string;
  customPdfParse: boolean;
  usageId?: string;
  getFormatText: boolean;
  imageKeyOptions?: {
    prefix: string;
    expiredTime?: Date;
  };
  onPdfParseUsage?: (usage: ChatNodeUsageType) => void;
}): Promise<Pick<ReadFileResponse, 'rawText' | 'tableInfo' | 'sourceMetadata'>> => {
  if (!initialBuffer && !source) {
    throw new Error('File content or source is required');
  }

  // 归一化扩展名为小写，避免大写/混合大小写后缀（如 .PDF）无法匹配解析器（#6996）
  const extension = rawExtension.toLowerCase();
  let materializedPromise:
    | Promise<{
        buffer: Buffer;
        extension: string;
        encoding: string;
        metadata?: FileSourceMetadata;
      }>
    | undefined;
  const getMaterializedFile = () => {
    if (!materializedPromise) {
      materializedPromise = initialBuffer
        ? Promise.resolve({ buffer: initialBuffer, extension, encoding: initialEncoding })
        : materializeFileSource(source!, { signal: new AbortController().signal }).then(
            (materialized) => ({
              buffer: materialized.buffer,
              extension: resolveFileSourceExtension(materialized),
              encoding: resolveFileSourceEncoding(materialized),
              metadata: materialized.metadata
            })
          );
    }
    return materializedPromise;
  };

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
    source
      ? readRawContentFromSource({ source, imageKeyOptions })
      : readRawContentFromBuffer({
          extension,
          encoding: initialEncoding,
          buffer: initialBuffer!,
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
  const parseFromCustomService = async (): Promise<ReadFileResponse> => {
    const url = global.systemEnv.customPdfParse?.url;
    const token = global.systemEnv.customPdfParse?.key;
    if (!url) return systemParse();

    const { buffer, extension: materializedExtension } = await getMaterializedFile();
    const start = Date.now();
    logger.info('Start parsing file via external service', { extension });

    const data = new FormData();
    data.append('file', buffer, {
      filename: `file.${materializedExtension}`
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

    const { buffer } = await getMaterializedFile();
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

    const { buffer } = await getMaterializedFile();
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

    const { buffer } = await getMaterializedFile();
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
    if (global.systemEnv.customPdfParse?.url) return parseFromCustomService();
    if (global.systemEnv.customPdfParse?.somarkApiKey) return parsePdfFromSomark();
    if (global.systemEnv.customPdfParse?.textinAppId) return parsePdfFromTextin();
    if (global.systemEnv.customPdfParse?.doc2xKey) return parsePdfFromDoc2x();

    return systemParse();
  };

  const getCustomParseExtensions = (): string[] => {
    return (serviceEnv.CUSTOM_PARSE_EXTENSIONS?.split(',') ?? [])
      .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);
  };

  const start = Date.now();
  logger.debug('Start parsing file', { extension });

  const parseResult = await (async () => {
    const customParseExtensions = getCustomParseExtensions();

    if (customParseExtensions.includes(extension)) {
      return await parseFromCustomService();
    }

    if (extension === 'pdf') {
      return await pdfParseFn();
    }
    return await systemParse();
  })();
  const { rawText, formatText, tableInfo } = parseResult;
  const sourceMetadata =
    parseResult.sourceMetadata ??
    (materializedPromise ? (await materializedPromise).metadata : undefined);

  logger.debug('File parsing completed', { extension, durationMs: Date.now() - start });

  return {
    rawText: getFormatText ? formatText || rawText : rawText,
    tableInfo,
    ...(sourceMetadata ? { sourceMetadata } : {})
  };
};
