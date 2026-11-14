import { getLightweightWorkerPoolOptions } from '../../worker/lightweightResource';
import { WorkerNameEnum, getWorkerController } from '../../worker/utils';
import { getLogger, LogCategories } from '../logger';
import { getSystemInstanceConfig } from '../system/systemInstanceConfig/runtime';

const logger = getLogger(LogCategories.INFRA.WORKER);
const HTML_TO_MARKDOWN_TIMEOUT_MS = 300000;

/**
 * 将 HTML 转为 Markdown。实际转换在 worker 中执行，并在派发前记录任务大小，
 * 便于定位站点同步中是否卡在 HTML 转换阶段。
 */
export const htmlToMarkdown = async (html?: string | null) => {
  const htmlContent = html || '';
  const workerController = getWorkerController<
    { html: string },
    {
      rawText: string;
    }
  >({
    name: WorkerNameEnum.htmlStr2Md,
    ...getLightweightWorkerPoolOptions<{ html: string }>(),
    taskTimeoutMs: HTML_TO_MARKDOWN_TIMEOUT_MS,
    maxTasksPerWorker: 100,
    // 阈值在 worker 启动时注入，变化时回收旧线程才能让后续转换读取新值。
    workerEnvVersion: String(getSystemInstanceConfig().performance.parse.maxHtmlTransformChars)
  });

  logger.info('HTML to markdown worker task started', {
    htmlLength: htmlContent.length,
    workerName: WorkerNameEnum.htmlStr2Md,
    maxReservedThreads: workerController.maxReservedThreads,
    timeoutMs: HTML_TO_MARKDOWN_TIMEOUT_MS
  });

  const md = await workerController.run({ html: htmlContent });

  return md.rawText;
};
