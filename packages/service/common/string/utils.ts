import { serviceEnv } from '../../env';
import { WorkerNameEnum, getWorkerController } from '../../worker/utils';
import { type ImageType } from '../../worker/readFile/type';
import { getLogger, LogCategories } from '../logger';

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
      imageList: ImageType[];
    }
  >({
    name: WorkerNameEnum.htmlStr2Md,
    maxReservedThreads: serviceEnv.HTML_TO_MARKDOWN_WORKERS,
    taskTimeoutMs: HTML_TO_MARKDOWN_TIMEOUT_MS,
    maxTasksPerWorker: 100
  });

  logger.info('HTML to markdown worker task started', {
    htmlLength: htmlContent.length,
    workerName: WorkerNameEnum.htmlStr2Md,
    maxReservedThreads: serviceEnv.HTML_TO_MARKDOWN_WORKERS,
    timeoutMs: HTML_TO_MARKDOWN_TIMEOUT_MS
  });

  const md = await workerController.run({ html: htmlContent });

  return md.rawText;
};
