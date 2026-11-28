import FormData from 'form-data';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { resolveSomarkBaseUrl } from '@fastgpt/global/common/system/config/schemas/providers';
import { createProxyAxios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { getPdfEnhancedParseTimeoutMs } from '../../common/file/parseTimeout';

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
export const useSomarkServer = ({
  apiKey,
  baseUrl,
  timeoutMs
}: {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
}) => {
  const logger = getLogger(LogCategories.MODULE.DATASET.FILE);
  // somarkBaseUrl 由 root 管理员在系统配置中维护，可指向私有化部署或内网反代 SoMark 服务；
  // 与 codeSandbox / sangfor 保持一致，对管理员端点关闭用户侧 SSRF 拦截，同时保留代理路由与响应体上限保护。
  // 解析结果 Markdown 中的图片 URL 仍由上层 parseMarkdownImages 走带 SSRF 校验的下载链路。
  const instance = createProxyAxios(
    {
      baseURL: resolveSomarkBaseUrl(baseUrl),
      timeout: timeoutMs ?? getPdfEnhancedParseTimeoutMs()
    },
    false
  );

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
          new Error(data?.message || `API error: ${data?.code ?? 'Unknown error'}`)
        );
      }

      const text = data.data?.result?.outputs?.markdown;
      if (!text) {
        return Promise.reject(new Error('No markdown content in response'));
      }

      const pages = data.data?.metadata?.page_num;
      if (typeof pages !== 'number' || !Number.isInteger(pages) || pages < 1) {
        return Promise.reject(new Error('Invalid page count in response'));
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
      return Promise.reject(error instanceof Error ? error : new Error(getErrText(error)));
    }
  };

  return {
    parsePDF
  };
};
