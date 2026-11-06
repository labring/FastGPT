import FormData from 'form-data';
import { delay } from '@fastgpt/global/common/system/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createProxyAxios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { getBackendFileOperationTimeoutMs } from '../../common/file/parseTimeout';

const MINICPM_OCR_DEFAULT_BASE_URL = 'https://api.modelbest.cn/v1';
const MINICPM_OCR_POLL_INTERVAL_MS = 2000;
const MINICPM_OCR_REQUEST_TIMEOUT_MS = 60000;
const MINICPM_OCR_CANCEL_TIMEOUT_MS = 10000;
const MINICPM_OCR_MAX_SUBMIT_ATTEMPTS = 20;
const MINICPM_OCR_MAX_BACKOFF_MS = 30000;

/**
 * 这些块不参与整页 Markdown，识别失败不会造成正文缺失，因此不阻断整篇解析。
 *
 * seal 不能放进这里：recognize_seal 默认开启，印章识别文本会写入 Markdown；
 * 主动关闭印章识别时状态是 skipped_seal，不是 failed，仍会正常通过。
 */
const MINICPM_OCR_NON_MARKDOWN_LABELS = new Set([
  'header',
  'footer',
  'number',
  'footnote',
  'aside_text',
  'image'
]);

type MiniCPMOcrBlock = {
  label?: string;
  status?: string;
};

type MiniCPMOcrPage = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
  ocr?: {
    blocks?: MiniCPMOcrBlock[];
  };
};

type MiniCPMOcrJobResponse = {
  id?: string;
  status?: string;
  pages_total?: number;
  markdown?: string;
  pages?: MiniCPMOcrPage[];
  error?:
    | string
    | {
        message?: string;
      };
};

const getErrorStatus = (error: any): number | undefined => {
  const status = error?.response?.status;
  return typeof status === 'number' ? status : undefined;
};

/** 读取 Retry-After（秒数或 HTTP 日期），缺失或非法时使用调用方提供的退避时间。 */
const getRetryAfterMs = (headers: any, fallbackMs: number) => {
  const raw =
    typeof headers?.get === 'function'
      ? headers.get('retry-after')
      : (headers?.['retry-after'] ?? headers?.['Retry-After']);

  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return raw * 1000;
  }
  if (typeof raw === 'string') {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const date = Date.parse(raw);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }

  return fallbackMs;
};

/** 无 Retry-After 时使用有上限的指数退避，并加少量抖动避免并发任务同时重试。 */
const getBackoffMs = (attempt: number) => {
  const baseMs = Math.min(1000 * 2 ** (attempt - 1), MINICPM_OCR_MAX_BACKOFF_MS);
  return baseMs + Math.floor(Math.random() * Math.min(1000, baseMs));
};

/**
 * 创建 MiniCPM-OCR 文档解析客户端。
 *
 * 解析接口是异步任务：先上传文件拿到 job id，再轮询任务状态，成功后读取
 * 顶层 markdown 和 pages_total。接口地址默认使用 ModelBest 国内站，可通过
 * baseURL 切换到国际站或兼容该协议的服务。
 *
 * 官方限制每个用户/项目最多 2 个活动任务，FastGPT 默认解析并发为 10，因此
 * 提交和轮询遇到 429 时都会在总截止时间内退避重试，而不是直接失败。
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
   * 任务 Success 时仍可能有内容块识别失败（status=failed）。这些块会缺内容但
   * 整页 Markdown 仍会返回，必须在入库前显式报错，避免把不完整文档当成完整结果。
   */
  const getFailedBlockLabels = (data: MiniCPMOcrJobResponse) => {
    const labels = new Set<string>();

    for (const page of data.pages ?? []) {
      for (const block of page.ocr?.blocks ?? []) {
        if (block.status !== 'failed') continue;

        const label = block.label?.trim() || 'unknown';
        if (MINICPM_OCR_NON_MARKDOWN_LABELS.has(label)) continue;
        labels.add(label);
      }
    }

    return Array.from(labels);
  };

  /**
   * MiniCPM-OCR 对图片区域只输出空的图片占位符，不返回图片内容。保留占位符
   * 会在 FastGPT 里显示为破图，这里直接删除。
   */
  const removeEmptyImagePlaceholders = (text: string) => text.replace(/!\[[^\]]*\]\(\s*\)/g, '');

  /** 尽力取消任务；取消失败只记录日志，不覆盖原始解析错误。 */
  const cancelJob = async (jobId: string) => {
    try {
      await instance.delete(`/document-parse/jobs/${encodeURIComponent(jobId)}`, {
        timeout: MINICPM_OCR_CANCEL_TIMEOUT_MS
      });
    } catch (error) {
      logger.warn('MiniCPM-OCR cancel job failed', {
        jobId,
        error: getErrText(error)
      });
    }
  };

  /**
   * 解析 PDF：提交异步任务、轮询结果、校验分块状态并返回 Markdown。
   *
   * 所有等待都共享同一个总截止时间；429 按 Retry-After 或有界指数退避重试，
   * 401/403/404 等永久错误快速失败。任务未结束时会在 finally 中取消。
   */
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
    const waitBeforeRetry = async (waitMs: number) => {
      const remainingMs = getRemainingMs();
      if (remainingMs <= 0) return false;

      await delay(Math.min(waitMs, remainingMs));
      return getRemainingMs() > 0;
    };

    // 1. 提交解析任务，遇到 429 时在总截止时间内退避重试。
    const submitJob = async () => {
      for (let attempt = 1; attempt <= MINICPM_OCR_MAX_SUBMIT_ATTEMPTS; attempt += 1) {
        const form = new FormData();
        form.append('file', fileBuffer, {
          filename: 'file.pdf',
          contentType: 'application/pdf'
        });

        try {
          const { data } = await instance.post<MiniCPMOcrJobResponse>(
            '/document-parse/jobs',
            form,
            {
              headers: form.getHeaders(),
              timeout: getRequestTimeout(getBackendFileOperationTimeoutMs())
            }
          );

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

          const status = getErrorStatus(error);
          if (status === 429 && attempt < MINICPM_OCR_MAX_SUBMIT_ATTEMPTS) {
            const responseHeaders = (error as any)?.response?.headers;
            const waitMs = getRetryAfterMs(responseHeaders, getBackoffMs(attempt));
            logger.warn('MiniCPM-OCR submit rate limited', { attempt, waitMs });
            if (!(await waitBeforeRetry(waitMs))) {
              throw new Error('[MiniCPM-OCR] Process timeout');
            }
            continue;
          }

          throw new Error(`[MiniCPM-OCR] Failed to submit job: ${getErrorMessage(error)}`);
        }
      }

      throw new Error('[MiniCPM-OCR] Failed to submit job: rate limited');
    };

    const jobId = await submitJob();

    // 2. 轮询任务，直到成功、失败或超时。
    let jobFinished = false;
    let pollAttempt = 0;
    try {
      while (getRemainingMs() > 0) {
        const { data } = await instance
          .get<MiniCPMOcrJobResponse>(`/document-parse/jobs/${encodeURIComponent(jobId)}`, {
            timeout: getRequestTimeout(MINICPM_OCR_REQUEST_TIMEOUT_MS)
          })
          .catch(async (error) => {
            const status = getErrorStatus(error);

            // 429 是临时限流，继续查询同一个 job，不能取消已提交的任务。
            if (status === 429) {
              pollAttempt += 1;
              const waitMs = getRetryAfterMs(error?.response?.headers, getBackoffMs(pollAttempt));
              logger.warn('MiniCPM-OCR poll rate limited', {
                jobId,
                attempt: pollAttempt,
                waitMs
              });
              if (!(await waitBeforeRetry(waitMs))) {
                throw new Error('[MiniCPM-OCR] Process timeout');
              }
              return { data: undefined };
            }

            // 401/403/404 等永久错误重试没有意义。
            if (typeof status === 'number' && status >= 400 && status < 500) {
              throw new Error(`[MiniCPM-OCR] Failed to get job: ${getErrorMessage(error)}`);
            }

            // 其余错误按网络抖动处理，继续重试到总超时。
            pollAttempt += 1;
            logger.warn('MiniCPM-OCR poll failed', { jobId, error: getErrText(error) });
            if (!(await waitBeforeRetry(MINICPM_OCR_POLL_INTERVAL_MS))) {
              throw new Error('[MiniCPM-OCR] Process timeout');
            }
            return { data: undefined };
          });

        if (!data) continue;

        if (data.status === 'Success') {
          jobFinished = true;

          const failedLabels = getFailedBlockLabels(data);
          if (failedLabels.length > 0) {
            throw new Error(
              `[MiniCPM-OCR] Some content blocks failed to parse: ${failedLabels.join(', ')}`
            );
          }

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

        if (!(await waitBeforeRetry(MINICPM_OCR_POLL_INTERVAL_MS))) break;
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
