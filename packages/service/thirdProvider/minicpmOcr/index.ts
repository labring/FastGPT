import FormData from 'form-data';
import { delay } from '@fastgpt/global/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createProxyAxios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { getBackendFileOperationTimeoutMs } from '../../common/file/parseTimeout';

const MINICPM_OCR_DEFAULT_BASE_URL = 'https://api.modelbest.cn/v1';
const MINICPM_OCR_POLL_INTERVAL_MS = 2000;
const MINICPM_OCR_REQUEST_TIMEOUT_MS = 60000;

type MiniCPMOcrJobResponse = {
  id?: string;
  status?: string;
  pages_total?: number;
  markdown?: string;
  pages?: {
    choices?: {
      message?: {
        content?: string;
      };
    }[];
  }[];
  error?:
    | string
    | {
        message?: string;
      };
};

/**
 * 创建 MiniCPM-OCR 文档解析客户端。
 *
 * 解析接口是异步任务：先上传文件拿到 job id，再轮询任务状态，成功后读取
 * 顶层 markdown 和 pages_total。接口地址默认使用 ModelBest 国内站，可通过
 * baseURL 切换到国际站或兼容该协议的服务。
 */
export const useMiniCPMOcrServer = ({ apiKey, baseURL }: { apiKey: string; baseURL?: string }) => {
  const logger = getLogger(LogCategories.MODULE.DATASET.FILE);
  const instance = createProxyAxios({
    baseURL: (baseURL?.trim() || MINICPM_OCR_DEFAULT_BASE_URL).replace(/\/+$/, ''),
    timeout: getBackendFileOperationTimeoutMs(),
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  /** 优先取服务端返回的 error.message，其余情况回退到通用错误文本。 */
  const getErrorMessage = (err: any) => {
    if (typeof err?.response?.data?.error?.message === 'string') {
      return err.response.data.error.message;
    }
    if (typeof err === 'string') return err;
    return getErrText(err);
  };

  /**
   * 读取任务返回的 Markdown。正常响应包含顶层 markdown；早期或兼容服务可能
   * 只返回逐页结果，因此再按页拼接一次，避免协议小差异直接失败。
   */
  const getMarkdown = (data: MiniCPMOcrJobResponse) => {
    if (typeof data.markdown === 'string') return data.markdown;

    const pageTexts = (data.pages ?? [])
      .map((page) => page.choices?.[0]?.message?.content)
      .filter((text): text is string => typeof text === 'string' && text.length > 0);
    return pageTexts.length > 0 ? pageTexts.join('\n\n') : undefined;
  };

  const getPageCount = (data: MiniCPMOcrJobResponse) => {
    const pagesTotal = data.pages_total;
    if (typeof pagesTotal === 'number' && Number.isInteger(pagesTotal) && pagesTotal >= 1) {
      return pagesTotal;
    }

    const pages = data.pages?.length ?? 0;
    return pages > 0 ? pages : undefined;
  };

  /**
   * MiniCPM-OCR 对图片区域只输出空的图片占位符，不返回图片内容。保留占位符
   * 会在 FastGPT 里显示为破图，这里直接删除。
   */
  const removeEmptyImagePlaceholders = (text: string) => text.replace(/!\[[^\]]*\]\(\s*\)/g, '');

  const cancelJob = async (jobId: string) => {
    try {
      await instance.delete(`/document-parse/jobs/${encodeURIComponent(jobId)}`, {
        timeout: MINICPM_OCR_REQUEST_TIMEOUT_MS
      });
    } catch (error) {
      logger.warn('MiniCPM-OCR cancel job failed', {
        jobId,
        error: getErrText(error)
      });
    }
  };

  const parsePDF = async (fileBuffer: Buffer) => {
    logger.debug('MiniCPM-OCR PDF parse started');
    const startTime = Date.now();
    const deadline = startTime + getBackendFileOperationTimeoutMs();
    const getRemainingMs = () => Math.max(0, deadline - Date.now());
    const getRequestTimeout = (maxTimeoutMs: number) => {
      const remainingMs = getRemainingMs();
      if (remainingMs <= 0) {
        throw new Error('[MiniCPM-OCR] Process timeout');
      }
      return Math.min(maxTimeoutMs, remainingMs);
    };
    const waitForNextPoll = async () => {
      const remainingMs = getRemainingMs();
      if (remainingMs <= 0) return false;

      await delay(Math.min(MINICPM_OCR_POLL_INTERVAL_MS, remainingMs));
      return getRemainingMs() > 0;
    };

    // 1. 提交解析任务，服务端会立即返回 job id。
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: 'file.pdf',
      contentType: 'application/pdf'
    });

    const jobId = await (async () => {
      try {
        const { data } = await instance.post<MiniCPMOcrJobResponse>('/document-parse/jobs', form, {
          headers: form.getHeaders(),
          timeout: getRequestTimeout(getBackendFileOperationTimeoutMs())
        });

        if (data?.error) {
          const message =
            typeof data.error === 'string' ? data.error : data.error.message || 'Unknown error';
          throw new Error(message);
        }
        if (typeof data?.id !== 'string' || !data.id) {
          throw new Error('No job id in response');
        }

        return data.id;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('[MiniCPM-OCR]')) throw error;
        throw new Error(`[MiniCPM-OCR] Failed to submit job: ${getErrorMessage(error)}`);
      }
    })();

    // 2. 轮询任务，直到成功、失败或超时。
    let jobFinished = false;
    try {
      while (getRemainingMs() > 0) {
        const { data } = await instance
          .get<MiniCPMOcrJobResponse>(`/document-parse/jobs/${encodeURIComponent(jobId)}`, {
            timeout: getRequestTimeout(MINICPM_OCR_REQUEST_TIMEOUT_MS)
          })
          .catch(async (error) => {
            // 4xx 通常是密钥失效或任务不存在，重试没有意义；其余错误按网络抖动处理。
            const status = error?.response?.status;
            if (typeof status === 'number' && status >= 400 && status < 500) {
              throw new Error(`[MiniCPM-OCR] Failed to get job: ${getErrorMessage(error)}`);
            }

            logger.warn('MiniCPM-OCR poll failed', { jobId, error: getErrText(error) });
            if (!(await waitForNextPoll())) {
              throw new Error('[MiniCPM-OCR] Process timeout');
            }
            return { data: undefined };
          });

        if (!data) continue;

        if (data.status === 'Success') {
          jobFinished = true;
          const text = getMarkdown(data);
          if (text === undefined) {
            throw new Error('[MiniCPM-OCR] No markdown content in response');
          }

          const pages = getPageCount(data);
          if (pages === undefined) {
            throw new Error('[MiniCPM-OCR] Invalid page count in response');
          }

          logger.debug('MiniCPM-OCR PDF parse finished', {
            durationMs: Date.now() - startTime,
            pages
          });

          return {
            pages,
            text: removeEmptyImagePlaceholders(text)
          };
        }

        if (data.status === 'Failed' || data.status === 'Cancelled') {
          jobFinished = true;
          const message =
            typeof data.error === 'string' ? data.error : data.error?.message || 'Unknown error';
          throw new Error(`[MiniCPM-OCR] Job ${data.status.toLowerCase()}: ${message}`);
        }

        if (!(await waitForNextPoll())) break;
      }

      throw new Error('[MiniCPM-OCR] Process timeout');
    } catch (error) {
      throw error instanceof Error && error.message.startsWith('[MiniCPM-OCR]')
        ? error
        : new Error(`[MiniCPM-OCR] ${getErrorMessage(error)}`);
    } finally {
      // 只有任务尚未结束时才取消，避免给已完成的任务多发一次 DELETE。
      if (!jobFinished) await cancelJob(jobId);
    }
  };

  return {
    parsePDF
  };
};
