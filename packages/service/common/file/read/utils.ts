import { uploadMongoImg } from '../image/controller';
import FormData from 'form-data';

import { WorkerNameEnum, runWorker } from '../../../worker/utils';
import fs from 'fs';
import type { ReadFileResponse } from '../../../worker/readFile/type';
import axios from 'axios';
import { addLog } from '../../system/log';
import { batchRun } from '@fastgpt/global/common/fn/utils';
import { matchMdImgTextAndUpload } from '@fastgpt/global/common/string/markdown';
import { createPdfParseUsage } from '../../../support/wallet/usage/controller';

export type readRawTextByLocalFileParams = {
  teamId: string;
  tmbId: string;
  path: string;
  encoding: string;
  customPdfParse?: boolean;
  metadata?: Record<string, any>;
};
export const readRawTextByLocalFile = async (params: readRawTextByLocalFileParams) => {
  const { path } = params;

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';

  const buffer = await fs.promises.readFile(path);

  return readRawContentByFileBuffer({
    extension,
    isQAImport: false,
    customPdfParse: params.customPdfParse,
    teamId: params.teamId,
    tmbId: params.tmbId,
    encoding: params.encoding,
    buffer,
    metadata: params.metadata
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
  isQAImport = false
}: {
  teamId: string;
  tmbId: string;

  extension: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;

  customPdfParse?: boolean;
  isQAImport: boolean;
}): Promise<ReadFileResponse> => {
  const systemParse = () =>
    runWorker<ReadFileResponse>(WorkerNameEnum.readFile, {
      extension,
      encoding,
      buffer,
      teamId
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
      success: boolean;
      message: string;
      data: {
        page: number;
        markdown: string;
      };
    }>(url, data, {
      timeout: 600000,
      headers: {
        ...data.getHeaders(),
        Authorization: token ? `Bearer ${token}` : undefined
      }
    });

    addLog.info(`Custom file parsing is complete, time: ${Date.now() - start}ms`);

    const rawText = response.data.markdown;
    const { text, imageList } = matchMdImgTextAndUpload(rawText);

    createPdfParseUsage({
      teamId,
      tmbId,
      pages: response.data.page
    });

    return {
      rawText: text,
      formatText: rawText,
      imageList
    };
  };
  // Custom read file service
  const pdfParseFn = async (): Promise<ReadFileResponse> => {
    if (!customPdfParse) return systemParse();
    if (global.systemEnv.customPdfParse?.url) return parsePdfFromCustomService();

    return systemParse();
  };

  let { rawText, formatText, imageList } = await (async () => {
    if (extension === 'pdf') {
      return await pdfParseFn();
    }
    return await systemParse();
  })();

  // markdown data format
  if (imageList) {
    await batchRun(imageList, async (item) => {
      const src = await (async () => {
        try {
          return await uploadMongoImg({
            base64Img: `data:${item.mime};base64,${item.base64}`,
            teamId,
            // expiredTime: addHours(new Date(), 1),
            metadata: {
              ...metadata,
              mime: item.mime
            }
          });
        } catch (error) {
          return '';
        }
      })();
      rawText = rawText.replace(item.uuid, src);
      if (formatText) {
        formatText = formatText.replace(item.uuid, src);
      }
    });
  }

  if (['csv', 'xlsx'].includes(extension)) {
    // qa data
    if (isQAImport) {
      rawText = rawText || '';
    } else {
      rawText = formatText || rawText;
    }
  }

  return { rawText, formatText, imageList };
};
