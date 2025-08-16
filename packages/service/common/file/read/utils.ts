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

export type readRawTextByLocalFileParams = {
  teamId: string;
  tmbId: string;
  path: string;
  encoding: string;
  customPdfParse?: string;
  getFormatText?: boolean;
  metadata?: Record<string, any>;
};
export const readRawTextByLocalFile = async (params: readRawTextByLocalFileParams) => {
  const { path } = params;

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';

  const buffer = await fs.promises.readFile(path);

  return readRawContentByFileBuffer({
    extension,
    customPdfParse: params.customPdfParse,
    getFormatText: params.getFormatText,
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
  customPdfParse,
  getFormatText = true
}: {
  teamId: string;
  tmbId: string;

  extension: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;

  customPdfParse?: string;
  getFormatText?: boolean;
}): Promise<{
  rawText: string;
}> => {
  const systemParse = () =>
    readRawContentFromBuffer({
      extension,
      encoding,
      buffer
    });
  const parsePdfFromCustomService = async (parser: any): Promise<ReadFileResponse> => {
    const url = parser.url;
    const token = parser.key;
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
      parserName: customPdfParse
    });

    return {
      rawText: text,
      formatText: text,
      imageList
    };
  };
  // Doc2x api
  const parsePdfFromDoc2x = async (parser: any): Promise<ReadFileResponse> => {
    const doc2xKey = parser.doc2xKey;
    if (!doc2xKey) return systemParse();

    const { pages, text, imageList } = await useDoc2xServer({ apiKey: doc2xKey }).parsePDF(buffer);

    createPdfParseUsage({
      teamId,
      tmbId,
      pages,
      parserName: customPdfParse
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

    const parsers = global.systemEnv.customPdfParse || [];
    const selectedParser = parsers.find((parser) => parser.name === customPdfParse);

    if (!selectedParser) return systemParse();

    if (selectedParser.url) return parsePdfFromCustomService(selectedParser);
    if (selectedParser.doc2xKey) return parsePdfFromDoc2x(selectedParser);

    return systemParse();
  };

  const start = Date.now();
  addLog.debug(`Start parse file`, { extension });

  let { rawText, formatText, imageList } = await (async () => {
    // Check if any parser supports this extension
    const parsers = global.systemEnv.customPdfParse || [];
    const selectedParser = parsers.find((parser) => parser.name === customPdfParse);
    const ext = selectedParser?.extension?.split(',');

    if (ext?.includes(extension)) {
      return await pdfParseFn();
    }

    return await systemParse();
  })();

  addLog.debug(`Parse file success, time: ${Date.now() - start}ms. `);

  // markdown data format
  if (imageList) {
    await batchRun(imageList, async (item) => {
      const src = await (async () => {
        try {
          return await uploadMongoImg({
            base64Img: `data:${item.mime};base64,${item.base64}`,
            teamId,
            metadata: {
              ...metadata,
              mime: item.mime
            }
          });
        } catch (error) {
          addLog.warn('Upload file image error', { error });
          return 'Upload load image error';
        }
      })();
      rawText = rawText.replace(item.uuid, src);
      if (formatText) {
        formatText = formatText.replace(item.uuid, src);
      }
    });
  }

  addLog.debug(`Upload file success, time: ${Date.now() - start}ms`);

  return { rawText: getFormatText ? formatText || rawText : rawText };
};
