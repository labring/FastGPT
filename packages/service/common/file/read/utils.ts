import FormData from 'form-data';
import fs from 'fs';
import type { ReadFileResponse } from '../../../worker/readFile/type';
import { axios } from '../../api/axios';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { matchMdImg } from '@fastgpt/global/common/string/markdown';
import { createPdfParseUsage } from '../../../support/wallet/usage/controller';
import { useDoc2xServer } from '../../../thirdProvider/doc2x';
import { readRawContentFromBuffer } from '../../../worker/function';
import { addLog } from '../../system/log';
import { uploadImage2S3Bucket, jwtSignS3ObjectKey } from '../../s3/utils';
import { uploadMongoImg } from '../image/controller';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { addDays } from 'date-fns';
import { UserError } from '@fastgpt/global/common/error/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

export type readRawTextByLocalFileParams = {
  teamId: string;
  tmbId: string;
  path: string;
  encoding: string;
  customPdfParse?: boolean;
  getFormatText?: boolean;
  usageId?: string;
};

type FileParseContext = {
  teamId: string;
  tmbId: string;
  buffer: Buffer;
  extension: string;
  filename?: string;
  usageId?: string;
};

const isPdfBufferEncrypted = (buffer: Buffer): boolean => {
  return buffer.includes(Buffer.from('/Encrypt'));
};

const parseByCustomService = async ({
  teamId,
  tmbId,
  buffer,
  extension,
  filename,
  usageId
}: FileParseContext): Promise<ReadFileResponse> => {
  const { url, key: token, timeout = 10 } = global.systemEnv.customPdfParse ?? {};
  if (!url || !token) {
    return Promise.reject(new Error('Custom PDF parse service URL and key must be configured'));
  }

  // 提前校验 URL 格式，避免 axios 内部抛出难以定位的 "Invalid URL" 错误
  try {
    new URL(url);
  } catch {
    return Promise.reject(
      new Error(
        `Custom parse service URL is invalid: "${url}". Please provide a full absolute URL (e.g. http://host:port/path).`
      )
    );
  }

  const start = Date.now();
  addLog.info('Parsing files from an external service', { url, extension, filename });

  // PDF 加密文件提前检测，避免将加密 PDF 发送给外部服务后收到 500 错误
  if (extension === 'pdf' && isPdfBufferEncrypted(buffer)) {
    return Promise.reject(new UserError(CommonErrEnum.pdfEncrypted));
  }

  const data = new FormData();
  data.append('file', buffer, { filename: filename || `file.${extension}` });

  addLog.debug('Calling custom parse service', { url, bufferSize: buffer.length });

  try {
    const { data: response } = await axios.post<{
      pages: number;
      markdown: string;
      error?: Object | string;
    }>(url, data, {
      timeout: timeout * 1000 * 60,
      headers: {
        ...data.getHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    if (response.error) {
      addLog.warn('Custom PDF parse service returned error', { error: response.error });
      return Promise.reject(
        new Error(
          typeof response.error === 'string' ? response.error : JSON.stringify(response.error)
        )
      );
    }

    if (typeof response.pages !== 'number' || response.pages < 0) {
      return Promise.reject(
        new Error(`Invalid response: pages must be a non-negative number, got ${response.pages}`)
      );
    }
    if (typeof response.markdown !== 'string') {
      return Promise.reject(new Error('Invalid response: markdown must be a string'));
    }

    addLog.info(`Custom file parsing is complete, time: ${Date.now() - start}ms`);

    createPdfParseUsage({ teamId, tmbId, pages: response.pages, usageId }).catch((error) => {
      addLog.error('Failed to create PDF parse usage', {
        teamId,
        tmbId,
        pages: response.pages,
        usageId,
        error
      });
    });

    const { text, imageList } = matchMdImg(response.markdown);
    return { rawText: text, formatText: text, imageList };
  } catch (error) {
    addLog.error('Custom parse service request failed', {
      url,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorCode: (error as any).code,
      errorStack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
};

const parseByDoc2x = async ({
  teamId,
  tmbId,
  buffer,
  extension,
  filename,
  usageId
}: FileParseContext): Promise<ReadFileResponse> => {
  const doc2xKey = global.systemEnv.customPdfParse?.doc2xKey;
  if (!doc2xKey) {
    return Promise.reject(new Error('doc2x API key must be configured'));
  }
  const { pages, text, imageList } = await useDoc2xServer({ apiKey: doc2xKey }).parsePDF(buffer);

  createPdfParseUsage({ teamId, tmbId, pages, usageId }).catch((error) => {
    addLog.error('Failed to create PDF parse usage', { teamId, tmbId, pages, usageId, error });
  });
  return { rawText: text, formatText: text, imageList };
};

export const readRawTextByLocalFile = async (
  params: readRawTextByLocalFileParams
): Promise<ReadFileResponse> => {
  const { path } = params;

  const extension = path.split('.').pop()?.toLowerCase() || '';
  const filename = path.split(/[/\\]/).pop();

  const buffer = await fs.promises.readFile(path);

  return readRawContentByFileBuffer({
    extension,
    customPdfParse: params.customPdfParse,
    getFormatText: params.getFormatText,
    teamId: params.teamId,
    tmbId: params.tmbId,
    encoding: params.encoding,
    buffer,
    filename,
    usageId: params.usageId
  });
};

export const readRawContentByFileBuffer = async ({
  teamId,
  tmbId,
  extension,
  buffer,
  encoding,
  metadata,
  customPdfParse = false,
  getFormatText = true,
  filename,
  usageId
}: {
  teamId: string;
  tmbId: string;
  extension: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;
  customPdfParse?: boolean;
  getFormatText?: boolean;
  filename?: string;
  usageId?: string;
}): Promise<ReadFileResponse> => {
  const systemParse = () => readRawContentFromBuffer({ extension, encoding, buffer });

  const getParseFn = (): (() => Promise<ReadFileResponse>) => {
    const isImageType = ['jpg', 'jpeg', 'png'].includes(extension);
    if (isImageType) {
      const cfg = global.systemEnv.customPdfParse;
      if (cfg?.url) {
        if (!cfg?.key)
          return () => Promise.reject(new UserError(CommonErrEnum.customParseMissingKey));
        return () => parseByCustomService({ teamId, tmbId, buffer, extension, filename, usageId });
      }
      return () =>
        Promise.reject(
          `Image file type (.${extension}) cannot be parsed as a document. Please use the image dataset collection feature or configure customPdfParse.`
        );
    }
    if (!customPdfParse) return systemParse;
    const cfg = global.systemEnv.customPdfParse;
    const isDocumentType = [
      'pdf',
      'doc',
      'docx',
      'ppt',
      'pptx',
      'xls',
      'xlsx',
      'html',
      'csv'
    ].includes(extension);
    if (isDocumentType && cfg?.url) {
      if (!cfg?.key)
        return () => Promise.reject(new UserError(CommonErrEnum.customParseMissingKey));
      return () => parseByCustomService({ teamId, tmbId, buffer, extension, filename, usageId });
    }
    if (extension === 'pdf' && cfg?.doc2xKey)
      return () => parseByDoc2x({ teamId, tmbId, buffer, extension, filename, usageId });
    return systemParse;
  };

  const start = Date.now();
  addLog.debug(`Start parse file`, { extension });

  let { rawText, formatText, imageList } = await getParseFn()();

  addLog.debug(`Parse file success, time: ${Date.now() - start}ms`);

  // upload inline images and replace uuid placeholders with real urls
  if (imageList) {
    await batchRun(imageList, async (item) => {
      let src: string | null = null;
      try {
        src = await uploadMongoImg({
          base64Img: `data:${item.mime};base64,${item.base64}`,
          teamId,
          metadata: { ...metadata, mime: item.mime }
        });
      } catch (error) {
        addLog.warn('Upload file image error', { error });
      }

      if (src) {
        rawText = rawText.replaceAll(item.uuid, src);
        if (formatText) formatText = formatText.replaceAll(item.uuid, src);
      } else {
        // remove the entire markdown image syntax to avoid leaving broken placeholders
        const imgPattern = new RegExp(`!\\[[^\\]]*\\]\\(${item.uuid}\\)`, 'g');
        rawText = rawText.replace(imgPattern, '');
        if (formatText) formatText = formatText.replace(imgPattern, '');
      }
    });
  }

  addLog.debug(`Upload file success, time: ${Date.now() - start}ms`);

  return { rawText: getFormatText ? formatText || rawText : rawText };
};

export const readS3FileContentByBuffer = async ({
  teamId,
  tmbId,
  extension,
  buffer,
  encoding,
  customPdfParse = false,
  getFormatText = true,
  filename,
  usageId,
  imageKeyOptions
}: {
  teamId: string;
  tmbId: string;
  extension: string;
  buffer: Buffer;
  encoding: string;
  customPdfParse?: boolean;
  getFormatText?: boolean;
  filename?: string;
  usageId?: string;
  imageKeyOptions?: { prefix: string; expiredTime?: Date };
}): Promise<ReadFileResponse> => {
  const systemParse = () => readRawContentFromBuffer({ extension, encoding, buffer });

  const getParseFn = (): (() => Promise<ReadFileResponse>) => {
    const isImageType = ['jpg', 'jpeg', 'png'].includes(extension);
    if (isImageType) {
      const cfg = global.systemEnv.customPdfParse;
      if (cfg?.url) {
        if (!cfg?.key)
          return () => Promise.reject(new UserError(CommonErrEnum.customParseMissingKey));
        return () => parseByCustomService({ teamId, tmbId, buffer, extension, filename, usageId });
      }
      return () =>
        Promise.reject(
          `Image file type (.${extension}) cannot be parsed as a document. Please use the image dataset collection feature or configure customPdfParse.`
        );
    }
    if (!customPdfParse) return systemParse;
    const cfg = global.systemEnv.customPdfParse;
    const isDocumentType = [
      'pdf',
      'doc',
      'docx',
      'ppt',
      'pptx',
      'xls',
      'xlsx',
      'html',
      'csv'
    ].includes(extension);
    if (isDocumentType && cfg?.url) {
      if (!cfg?.key)
        return () => Promise.reject(new UserError(CommonErrEnum.customParseMissingKey));
      return () => parseByCustomService({ teamId, tmbId, buffer, extension, filename, usageId });
    }
    if (extension === 'pdf' && cfg?.doc2xKey)
      return () => parseByDoc2x({ teamId, tmbId, buffer, extension, filename, usageId });
    return systemParse;
  };

  const start = Date.now();
  addLog.debug(`Start parse file`, { extension });

  let { rawText, formatText, imageList } = await getParseFn()();

  addLog.debug(`Parse file success, time: ${Date.now() - start}ms`);

  // upload inline images to S3 and replace uuid placeholders with real urls
  if (imageList && imageKeyOptions) {
    await batchRun(imageList, async (item) => {
      let src: string | null = null;
      try {
        const ext = item.mime.split('/')[1] || 'png';
        const imageKey = `${imageKeyOptions.prefix}/${getNanoid(12)}.${ext}`;
        await uploadImage2S3Bucket('private', {
          base64Img: `data:${item.mime};base64,${item.base64}`,
          uploadKey: imageKey,
          mimetype: item.mime,
          filename: `${getNanoid(6)}.${ext}`,
          expiredTime: imageKeyOptions.expiredTime
        });
        const signExpiry = imageKeyOptions.expiredTime ?? addDays(new Date(), 90);
        src = jwtSignS3ObjectKey(imageKey, signExpiry);
      } catch (error) {
        addLog.warn('Upload file image to S3 error', { error });
      }

      if (src) {
        rawText = rawText.replaceAll(item.uuid, src);
        if (formatText) formatText = formatText.replaceAll(item.uuid, src);
      } else {
        const imgPattern = new RegExp(`!\\[[^\\]]*\\]\\(${item.uuid}\\)`, 'g');
        rawText = rawText.replace(imgPattern, '');
        if (formatText) formatText = formatText.replace(imgPattern, '');
      }
    });
  }

  addLog.debug(`Upload file success, time: ${Date.now() - start}ms`);

  return { rawText: getFormatText ? formatText || rawText : rawText };
};
