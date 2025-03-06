import { uploadMongoImg } from '../image/controller';
import FormData from 'form-data';
import { WorkerNameEnum, runWorker } from '../../../worker/utils';
import fs from 'fs';
import type { ImageType, ReadFileResponse } from '../../../worker/readFile/type';
import axios from 'axios';
import { addLog } from '../../system/log';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { htmlTable2Md, matchMdImg } from '@fastgpt/global/common/string/markdown';
import { createPdfParseUsage } from '../../../support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { delay } from '@fastgpt/global/common/system/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getImageBase64 } from '../image/utils';

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
      pages: response.pages
    });

    return {
      rawText: text,
      formatText: rawText,
      imageList
    };
  };
  const parsePdfFromDoc2x = async (): Promise<ReadFileResponse> => {
    const doc2xKey = global.systemEnv.customPdfParse?.doc2xKey;
    if (!doc2xKey) return systemParse();

    const parseTextImage = async (text: string) => {
      // Extract image links and convert to base64
      const imageList: { id: string; url: string }[] = [];
      let processedText = text.replace(/!\[.*?\]\((http[^)]+)\)/g, (match, url) => {
        const id = `IMAGE_${getNanoid()}_IMAGE`;
        imageList.push({
          id,
          url
        });
        return `![](${id})`;
      });

      // Get base64 from image url
      let resultImageList: ImageType[] = [];
      await batchRun(
        imageList,
        async (item) => {
          try {
            const { base64, mime } = await getImageBase64(item.url);
            resultImageList.push({
              uuid: item.id,
              mime,
              base64
            });
          } catch (error) {
            processedText = processedText.replace(item.id, item.url);
            addLog.warn(`Failed to get image from ${item.url}: ${getErrText(error)}`);
          }
        },
        5
      );

      return {
        text: processedText,
        imageList: resultImageList
      };
    };

    let startTime = Date.now();

    // 1. Get pre-upload URL first
    const { data: preupload_data } = await axios
      .post<{ code: string; data: { uid: string; url: string } }>(
        'https://v2.doc2x.noedgeai.com/api/v2/parse/preupload',
        null,
        {
          headers: {
            Authorization: `Bearer ${doc2xKey}`
          }
        }
      )
      .catch((error) => {
        return Promise.reject(
          `[Pre-upload Error] Failed to get pre-upload URL: ${getErrText(error)}`
        );
      });
    if (preupload_data?.code !== 'success') {
      return Promise.reject(`Failed to get pre-upload URL: ${JSON.stringify(preupload_data)}`);
    }

    const upload_url = preupload_data.data.url;
    const uid = preupload_data.data.uid;

    // 2. Upload file to pre-signed URL with binary stream
    const blob = new Blob([buffer], { type: 'application/pdf' });
    const response = await axios
      .put(upload_url, blob, {
        headers: {
          'Content-Type': 'application/pdf'
        }
      })
      .catch((error) => {
        return Promise.reject(`[Upload Error] Failed to upload file: ${getErrText(error)}`);
      });
    if (response.status !== 200) {
      return Promise.reject(`Upload failed with status ${response.status}: ${response.statusText}`);
    }

    await delay(5000);
    addLog.debug(`Uploaded file to Doc2x, uid: ${uid}`);
    // 3. Get the result by uid
    const checkResult = async (retry = 30) => {
      if (retry <= 0) {
        return Promise.reject(
          `[Parse Timeout Error] Failed to get result (uid: ${uid}): Process timeout`
        );
      }

      try {
        const { data: result_data } = await axios
          .get<{
            code: string;
            data: {
              progress: number;
              status: 'processing' | 'failed' | 'success';
              result: {
                pages: {
                  md: string;
                }[];
              };
            };
          }>(`https://v2.doc2x.noedgeai.com/api/v2/parse/status?uid=${uid}`, {
            headers: {
              Authorization: `Bearer ${doc2xKey}`
            }
          })
          .catch((error) => {
            return Promise.reject(
              `[Parse Status Error] Failed to get parse status: ${getErrText(error)}`
            );
          });

        // Error
        if (!['ok', 'success'].includes(result_data.code)) {
          return Promise.reject(
            `Failed to get result (uid: ${uid}): ${JSON.stringify(result_data)}`
          );
        }

        // Process
        if (['ready', 'processing'].includes(result_data.data.status)) {
          addLog.debug(`Waiting for the result, uid: ${uid}`);
          await delay(5000);
          return checkResult(retry - 1);
        }

        // Finifsh
        if (result_data.data.status === 'success') {
          const result = result_data.data.result.pages
            .map((page) => page.md)
            .join('')
            // Do some post-processing
            .replace(/\\[\(\)]/g, '$')
            .replace(/\\[\[\]]/g, '$$')
            .replace(/<img\s+src="([^"]+)"(?:\s*\?[^>]*)?(?:\s*\/>|>)/g, '![img]($1)')
            .replace(/<!-- Media -->/g, '')
            .replace(/<!-- Footnote -->/g, '')
            .replace(/\$(.+?)\s+\\tag\{(.+?)\}\$/g, '$$$1 \\qquad \\qquad ($2)$$')
            .replace(/\\text\{([^}]*?)(\b\w+)_(\w+\b)([^}]*?)\}/g, '\\text{$1$2\\_$3$4}');

          const { text, imageList } = await parseTextImage(htmlTable2Md(result));

          return {
            pages: result_data.data.result.pages.length,
            text,
            imageList
          };
        }
        return checkResult(retry - 1);
      } catch (error) {
        if (retry > 1) {
          await delay(100);
          return checkResult(retry - 1);
        }
        return Promise.reject(error);
      }
    };

    const { pages, text, imageList } = await checkResult();

    createPdfParseUsage({
      teamId,
      tmbId,
      pages
    });

    addLog.info(`Doc2x parse success, time: ${Date.now() - startTime}ms`);
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
