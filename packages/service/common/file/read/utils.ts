import { uploadMongoImg } from '../image/controller';
import FormData from 'form-data';
import fs from 'fs';
import type { ReadFileResponse } from '../../../worker/readFile/type';
import axios from 'axios';
import { addLog } from '../../system/log';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { matchMdImg } from '@fastgpt/global/common/string/markdown';
import { createPdfParseUsage } from '../../../support/wallet/usage/controller';
import { useDoc2xServer } from '../../../thirdProvider/doc2x';
import { readRawContentFromBuffer } from '../../../worker/function';
import { getS3DatasetSource } from '../../s3/sources/dataset';
import type { ParsedFileContentS3KeyParams } from '../../s3/sources/dataset/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import path from 'path';
import { S3Sources } from '../../s3/type';
import { randomUUID } from 'crypto';

export type readRawTextByLocalFileParams = {
  teamId: string;
  tmbId: string;
  path: string;
  encoding: string;
  customPdfParse?: boolean;
  getFormatText?: boolean;
  uploadKey: string;
  metadata?: Record<string, any>;
};
export const readRawTextByLocalFile = async (params: readRawTextByLocalFileParams) => {
  const { path } = params;

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';

  const buffer = await fs.promises.readFile(path);

  return readS3FileContentByBuffer({
    extension,
    customPdfParse: params.customPdfParse,
    getFormatText: params.getFormatText,
    teamId: params.teamId,
    tmbId: params.tmbId,
    encoding: params.encoding,
    buffer,
    uploadKeyPrefix: params.uploadKey
  });
};

export const readS3FileContentByBuffer = async ({
  teamId,
  tmbId,

  extension,
  buffer,
  encoding,
  customPdfParse = false,
  usageId,
  getFormatText = true,
  uploadKeyPrefix
}: {
  teamId: string;
  tmbId: string;

  extension: string;
  buffer: Buffer;
  encoding: string;

  customPdfParse?: boolean;
  usageId?: string;
  getFormatText?: boolean;
  uploadKeyPrefix: string;
}): Promise<{
  rawText: string;
  imageKeys?: string[];
}> => {
  const systemParse = () =>
    readRawContentFromBuffer({
      extension,
      encoding,
      buffer
    });
  const parsePdfFromCustomService = async (): Promise<ReadFileResponse> => {
    const url = global.systemEnv.customPdfParse?.url;
    const token = global.systemEnv.customPdfParse?.key;
    if (!url) return systemParse();

    const start = Date.now();
    addLog.info('Parsing files from an external service');

    const data = new FormData();
    data.append('file', buffer, {
      filename: `file.${extension}`
    });
    const { data: response } = await axios.post<{
      pages: number;
      markdown: string;
      error?: Object | string;
    }>(url, data, {
      timeout: 600000,
      headers: {
        ...data.getHeaders(),
        Authorization: token ? `Bearer ${token}` : undefined
      }
    });

    if (response.error) {
      return Promise.reject(response.error);
    }

    addLog.info(`Custom file parsing is complete, time: ${Date.now() - start}ms`);

    const rawText = response.markdown;
    const { text, imageList } = matchMdImg(rawText);

    createPdfParseUsage({
      teamId,
      tmbId,
      pages: response.pages,
      usageId
    });

    return {
      rawText: text,
      formatText: text,
      imageList
    };
  };
  // Doc2x api
  const parsePdfFromDoc2x = async (): Promise<ReadFileResponse> => {
    const doc2xKey = global.systemEnv.customPdfParse?.doc2xKey;
    if (!doc2xKey) return systemParse();

    const { pages, text, imageList } = await useDoc2xServer({ apiKey: doc2xKey }).parsePDF(buffer);

    createPdfParseUsage({
      teamId,
      tmbId,
      pages,
      usageId
    });

    return {
      rawText: text,
      formatText: text,
      imageList
    };
  };
  // Custom read file service
  const pdfParseFn = async (): Promise<ReadFileResponse> => {
    if (!customPdfParse) return systemParse();
    if (global.systemEnv.customPdfParse?.url) return parsePdfFromCustomService();
    if (global.systemEnv.customPdfParse?.doc2xKey) return parsePdfFromDoc2x();

    return systemParse();
  };

  const start = Date.now();
  addLog.debug(`Start parse file`, { extension });

  let { rawText, formatText, imageList } = await (async () => {
    if (extension === 'pdf') {
      return await pdfParseFn();
    }
    return await systemParse();
  })();

  addLog.debug(`Parse file success, time: ${Date.now() - start}ms. `);

  // markdown data format
  const uploadedImageKeys: string[] = [];
  if (imageList && imageList.length > 0) {
    addLog.debug(`Processing ${imageList.length} images from parsed document`);

    await batchRun(imageList, async (item) => {
      const src = await (async () => {
        try {
          const ext = item.mime.split('/')[1].replace('x-', '');
          const imageKey = await getS3DatasetSource().uploadDatasetImage({
            base64Img: `data:${item.mime};base64,${item.base64}`,
            mimetype: `${ext}`,
            filename: `${item.uuid}.${ext}`,
            uploadKey: `${uploadKeyPrefix}/${item.uuid}.${ext}`
          });
          uploadedImageKeys.push(imageKey);
          return imageKey;
        } catch (error) {
          // Don't add to uploadedImageKeys if upload failed, but still continue processing
          return `[Image Upload Failed: ${item.uuid}]`;
        }
      })();
      rawText = rawText.replace(item.uuid, src);
      if (formatText) {
        formatText = formatText.replace(item.uuid, src);
      }
    });

    // Log summary of image processing
    addLog.info(`Image processing completed`, {
      total: imageList.length,
      successful: uploadedImageKeys.length,
      failed: imageList.length - uploadedImageKeys.length
    });
  }

  addLog.debug(`Upload file to S3 success, time: ${Date.now() - start}ms`, {
    uploadedImageKeysCount: uploadedImageKeys.length,
    uploadedImageKeys
  });

  return {
    rawText: getFormatText ? formatText || rawText : rawText,
    imageKeys: uploadedImageKeys
  };
};

export const parsedFileContentS3Key = {
  temp: (appId: string) => `chat/${appId}/temp/parsed/${randomUUID()}`,

  chat: ({ appId, chatId, uId }: { chatId: string; uId: string; appId: string }) =>
    `chat/${appId}/${uId}/${chatId}/parsed`,

  dataset: (params: ParsedFileContentS3KeyParams) => {
    const { datasetId, mimetype, filename, parentFileKey } = params;

    const extension = mimetype;
    const image = (() => {
      if (filename) {
        return Boolean(path.extname(filename))
          ? `${getNanoid(6)}-${filename}`
          : `${getNanoid(6)}-${filename}.${extension}`;
      }
      return `${getNanoid(6)}.${extension}`;
    })();

    const parentFilename = parentFileKey?.slice().split('/').at(-1);
    const parsedParentFilename = parentFilename
      ? `parsed-${path.basename(parentFilename, path.extname(parentFilename))}`
      : '';
    const parsedParentFileKey = parentFileKey
      ?.split('/')
      .slice(0, -1)
      .concat(parsedParentFilename)
      .join('/');

    return {
      key: parsedParentFileKey
        ? `${parsedParentFileKey}/${image}`
        : [S3Sources.dataset, datasetId, image].join('/'),
      filename: image
    };
  }
};
