import { env } from '../../env';
import { WorkerNameEnum, getWorkerController } from '../../worker/utils';
import { type ImageType } from '../../worker/readFile/type';

export const htmlToMarkdown = async (html?: string | null) => {
  const workerController = getWorkerController<
    { html: string },
    {
      rawText: string;
      imageList: ImageType[];
    }
  >({
    name: WorkerNameEnum.htmlStr2Md,
    maxReservedThreads: env.HTML_TO_MARKDOWN_WORKERS,
    taskTimeoutMs: 300000,
    maxTasksPerWorker: 100
  });

  const md = await workerController.run({ html: html || '' });

  return md.rawText;
};
