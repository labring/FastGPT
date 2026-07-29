import FormData from 'form-data';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createProxyAxios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';

type SomarkResponse = {
  code?: number;
  message?: string;
  data?: {
    metadata?: {
      page_num?: number;
    };
    result?: {
      outputs?: {
        markdown?: string;
      };
    };
  };
};

/**
 * 创建 SoMark PDF 解析客户端。
 *
 * SoMark 的 API Key 通过 multipart body 传递，不使用 Authorization header。
 * 当前只请求 Markdown，图片保留为 URL，交由上层统一转存。
 */
export const useSomarkServer = ({ apiKey }: { apiKey: string }) => {
  const logger = getLogger(LogCategories.MODULE.DATASET.FILE);
  const instance = createProxyAxios({
    baseURL: 'https://somark.ai/api/v1',
    timeout: 600000
  });

  const parsePDF = async (fileBuffer: Buffer) => {
    const startTime = Date.now();
    const form = new FormData();

    form.append('file', fileBuffer, {
      filename: 'file.pdf',
      contentType: 'application/pdf'
    });
    form.append('api_key', apiKey);
    form.append('output_formats', 'markdown');
    form.append(
      'element_formats',
      JSON.stringify({
        image: 'url',
        formula: 'latex',
        table: 'markdown',
        cs: 'image'
      })
    );

    try {
      const { data } = await instance.post<SomarkResponse>('/parse/sync', form, {
        headers: form.getHeaders()
      });

      if (data?.code !== 0) {
        return Promise.reject(
          new Error(`[SoMark] ${data?.message || `API error: ${data?.code ?? 'Unknown error'}`}`)
        );
      }

      const text = data.data?.result?.outputs?.markdown;
      if (!text) {
        return Promise.reject(new Error('[SoMark] No markdown content in response'));
      }

      const pages = data.data?.metadata?.page_num;
      if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < 1) {
        return Promise.reject(new Error('[SoMark] Invalid page count in response'));
      }

      logger.debug('SoMark PDF parse finished', {
        durationMs: Date.now() - startTime,
        pages
      });

      return {
        pages,
        text
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[SoMark]')) {
        throw error;
      }

      return Promise.reject(new Error(`[SoMark] ${getErrText(error)}`));
    }
  };

  return {
    parsePDF
  };
};
