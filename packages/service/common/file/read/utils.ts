import { markdownProcess } from '@fastgpt/global/common/string/markdown';
import { uploadMongoImg } from '../image/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { addHours } from 'date-fns';
import FormData from 'form-data';

import { WorkerNameEnum, runWorker } from '../../../worker/utils';
import fs from 'fs';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import type { ReadFileResponse } from '../../../worker/readFile/type';
import axios from 'axios';
import { addLog } from '../../system/log';

export type readRawTextByLocalFileParams = {
  teamId: string;
  path: string;
  metadata?: Record<string, any>;
};
export const readRawTextByLocalFile = async (params: readRawTextByLocalFileParams) => {
  const { path } = params;

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';

  const buffer = fs.readFileSync(path);
  const encoding = detectFileEncoding(buffer);

  const { rawText } = await readRawContentByFileBuffer({
    extension,
    isQAImport: false,
    teamId: params.teamId,
    encoding,
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
  // Upload image in markdown
  const matchMdImgTextAndUpload = ({ teamId, md }: { md: string; teamId: string }) =>
    markdownProcess({
      rawText: md,
      uploadImgController: (base64Img) =>
        uploadMongoImg({
          type: MongoImageTypeEnum.collectionImage,
          base64Img,
          teamId,
          metadata,
          expiredTime: addHours(new Date(), 1)
        })
    });

  /* If */
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
      };
    }>(customReadfileUrl, data, {
      timeout: 600000,
      headers: {
        ...data.getHeaders()
      }
    });

    addLog.info(`Use custom read file service, time: ${Date.now() - start}ms`);

    const rawText = response.data.markdown;

    return {
      rawText,
      formatText: rawText
    };
  };

  let { rawText, formatText } =
    (await readFileFromCustomService()) ||
    (await runWorker<ReadFileResponse>(WorkerNameEnum.readFile, {
      extension,
      encoding,
      buffer
    }));

  // markdown data format
  if (['md', 'html', 'docx', ...customReadFileExtension.split(',')].includes(extension)) {
    rawText = await matchMdImgTextAndUpload({
      teamId: teamId,
      md: rawText
    });
  }

  if (['csv', 'xlsx'].includes(extension)) {
    // qa data
    if (isQAImport) {
      rawText = rawText || '';
    } else {
      rawText = formatText || '';
    }
  }

  return { rawText };
};
