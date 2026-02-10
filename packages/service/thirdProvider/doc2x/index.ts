import { batchRun, delay } from '@fastgpt/global/common/system/utils';
import { htmlTable2Md } from '@fastgpt/global/common/string/markdown';
import { type Method } from 'axios';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { type ImageType } from '../../worker/readFile/type';
import { getImageBase64 } from '../../common/file/image/utils';
import { createProxyAxios, axios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';

type ApiResponseDataType<T = any> = {
  code: string;
  msg?: string;
  data: T;
};

export const useDoc2xServer = ({ apiKey }: { apiKey: string }) => {
  const logger = getLogger(LogCategories.MODULE.DATASET);
  // Init request
  const instance = createProxyAxios({
    baseURL: 'https://v2.doc2x.noedgeai.com/api',
    timeout: 60000,
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  // Response check
  const checkRes = (data: ApiResponseDataType) => {
    if (data === undefined) {
      logger.warn('Doc2x response data is empty');
      return Promise.reject('服务器异常');
    }
    return data;
  };
  const responseError = (err: any) => {
    if (!err) {
      return Promise.reject({ message: '[Doc2x] Unknown error' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: `[Doc2x] ${err}` });
    }
    if (typeof err.data === 'string') {
      return Promise.reject({ message: `[Doc2x] ${err.data}` });
    }
    if (err?.response?.data) {
      return Promise.reject({ message: `[Doc2x] ${getErrText(err?.response?.data)}` });
    }
    if (typeof err.message === 'string') {
      return Promise.reject({ message: `[Doc2x] ${err.message}` });
    }

    logger.error('Doc2x request failed with unknown error', { error: err });
    return Promise.reject({ message: `[Doc2x] ${getErrText(err)}` });
  };
  const request = <T>(url: string, data: any, method: Method): Promise<ApiResponseDataType<T>> => {
    // Remove empty data
    for (const key in data) {
      if (data[key] === undefined) {
        delete data[key];
      }
    }

    return instance
      .request({
        url,
        method,
        data: ['POST', 'PUT'].includes(method) ? data : undefined,
        params: !['POST', 'PUT'].includes(method) ? data : undefined
      })
      .then((res) => checkRes(res.data))
      .catch((err) => responseError(err));
  };

  const parsePDF = async (fileBuffer: Buffer) => {
    logger.debug('Doc2x PDF parse started');
    const startTime = Date.now();

    // 1. Get pre-upload URL first
    const {
      code,
      msg,
      data: preupload_data
    } = await request<{ uid: string; url: string }>('/v2/parse/preupload', {}, 'POST');
    if (!['ok', 'success'].includes(code)) {
      return Promise.reject(`[Doc2x] Failed to get pre-upload URL: ${msg}`);
    }
    const upload_url = preupload_data.url;
    const uid = preupload_data.uid;

    // 2. Upload file to pre-signed URL with binary stream
    const response = await axios
      .put(upload_url, fileBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': fileBuffer.length.toString()
        }
      })
      .catch((error) => {
        return Promise.reject(`[Doc2x] Failed to upload file: ${getErrText(error)}`);
      });

    if (response.status !== 200) {
      return Promise.reject(
        `[Doc2x] Upload failed with status ${response.status}: ${response.statusText}`
      );
    }
    logger.debug('Doc2x file uploaded', { uid });

    await delay(5000);

    // 3. Get the result by uid
    const checkResult = async () => {
      // 10 minutes
      let retry = 120;

      while (retry > 0) {
        try {
          const {
            code,
            data: result_data,
            msg
          } = await request<{
            progress: number;
            status: 'processing' | 'failed' | 'success';
            result: {
              pages: {
                md: string;
              }[];
            };
          }>(`/v2/parse/status?uid=${uid}`, null, 'GET');

          // Error
          if (!['ok', 'success'].includes(code)) {
            return Promise.reject(`[Doc2x] Failed to get result (uid: ${uid}): ${msg}`);
          }

          // Process
          if (['ready', 'processing'].includes(result_data.status)) {
            logger.debug('Doc2x parse in progress', {
              uid,
              status: result_data.status,
              progress: result_data.progress
            });
            await delay(5000);
          }

          // Finifsh
          if (result_data.status === 'success') {
            const cleanedText = result_data.result.pages
              .map((page) => page.md)
              .join('')
              .replace(/\\[\(\)]/g, '$')
              .replace(/\\[\[\]]/g, '$$')
              .replace(/<img\s+src="([^"]+)"(?:\s*\?[^>]*)?(?:\s*\/>|>)/g, '![img]($1)')
              .replace(/<!-- Media -->/g, '')
              .replace(/<!-- Footnote -->/g, '')
              .replace(/<!-- Meanless:[\s\S]*?-->/g, '')
              .replace(/<!-- figureText:[\s\S]*?-->/g, '')
              .replace(/\$(.+?)\s+\\tag\{(.+?)\}\$/g, '$$$1 \\qquad \\qquad ($2)$$')
              .replace(/\\text\{([^}]*?)(\b\w+)_(\w+\b)([^}]*?)\}/g, '\\text{$1$2\\_$3$4}');
            const remainingTags = cleanedText.match(/<!--[\s\S]*?-->/g);
            if (remainingTags) {
              logger.warn('Doc2x cleaned markdown still contains tags', {
                count: remainingTags.length,
                tags: remainingTags.slice(0, 3)
              });
            }
            return {
              text: cleanedText,
              pages: result_data.result.pages.length
            };
          }
        } catch (error) {
          // Just network error
          logger.warn('Doc2x result polling failed', { error });
          await delay(500);
        }

        retry--;
      }
      return Promise.reject(`[Doc2x] Failed to get result (uid: ${uid}): Process timeout`);
    };

    const { text, pages } = await checkResult();

    // ![](url) => ![](base64)
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
            logger.warn('Doc2x image fetch failed', { url: item.url, error });
          }
        },
        5
      );

      return {
        text: processedText,
        imageList: resultImageList
      };
    };
    const { text: formatText, imageList } = await parseTextImage(htmlTable2Md(text));

    logger.debug('Doc2x PDF parse finished', {
      durationMs: Date.now() - startTime,
      pages
    });

    return {
      pages,
      text: formatText,
      imageList
    };
  };

  return {
    parsePDF
  };
};
