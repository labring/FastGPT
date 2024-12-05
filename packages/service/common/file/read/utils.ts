import { uploadMongoImg } from '../image/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import FormData from 'form-data';

import { WorkerNameEnum, runWorker } from '../../../worker/utils';
import fs from 'fs';
import type { ReadFileResponse } from '../../../worker/readFile/type';
import axios from 'axios';
import { addLog } from '../../system/log';
import { batchRun } from '@fastgpt/global/common/fn/utils';
import { addHours } from 'date-fns';
import { matchMdImgTextAndUpload } from '@fastgpt/global/common/string/markdown';

export type readRawTextByLocalFileParams = {
  teamId: string;
  path: string;
  encoding: string;
  metadata?: Record<string, any>;
};
export const readRawTextByLocalFile = async (params: readRawTextByLocalFileParams) => {
  const { path } = params;

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';

  const buffer = fs.readFileSync(path);

  const { rawText } = await readRawContentByFileBuffer({
    extension,
    isQAImport: false,
    teamId: params.teamId,
    encoding: params.encoding,
    buffer,
    metadata: params.metadata
  });

  return {
    rawText
  };
};

export const readRawContentByFileBuffer = async ({
  extension,
  isQAImport,
  teamId,
  buffer,
  encoding,
  metadata
}: {
  isQAImport?: boolean;
  extension: string;
  teamId: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;
}) => {
  // Custom read file service
  const customReadfileUrl = process.env.CUSTOM_READ_FILE_URL;
  const customReadFileExtension = process.env.CUSTOM_READ_FILE_EXTENSION || '';
  const ocrParse = process.env.CUSTOM_READ_FILE_OCR || 'false';
  const readFileFromCustomService = async (): Promise<ReadFileResponse | undefined> => {
    if (
      !customReadfileUrl ||
      !customReadFileExtension ||
      !customReadFileExtension.includes(extension)
    )
      return;

    const start = Date.now();
    addLog.info('Parsing files from an external service');

    const data = new FormData();
    data.append('file', buffer, {
      filename: `file.${extension}`
    });
    data.append('extension', extension);
    data.append('ocr', ocrParse);
    const { data: response } = await axios.post<{
      success: boolean;
      message: string;
      data: {
        page: number;
        markdown: string;
        duration: number;
      };
    }>(customReadfileUrl, data, {
      timeout: 600000,
      headers: {
        ...data.getHeaders()
      }
    });

    addLog.info(`Custom file parsing is complete, time: ${Date.now() - start}ms`);

    const rawText = response.data.markdown;
    const { text, imageList } = matchMdImgTextAndUpload(rawText);

    return {
      rawText: text,
      formatText: rawText,
      imageList
    };
  };

  let { rawText, formatText, imageList } =
    (await readFileFromCustomService()) ||
    (await runWorker<ReadFileResponse>(WorkerNameEnum.readFile, {
      extension,
      encoding,
      buffer,
      teamId
    }));

  // markdown data format
  if (imageList) {
    await batchRun(imageList, async (item) => {
      const src = await uploadMongoImg({
        type: MongoImageTypeEnum.collectionImage,
        base64Img: `data:${item.mime};base64,${item.base64}`,
        teamId,
        expiredTime: addHours(new Date(), 1),
        metadata: {
          ...metadata,
          mime: item.mime
        }
      });
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

  return { rawText };
};
