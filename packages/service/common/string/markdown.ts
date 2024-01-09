import { simpleMarkdownText } from '@fastgpt/global/common/string/markdown';
import { Worker } from 'worker_threads';
import { getWorkerPath } from './utils';

/* html string to markdown */
export const htmlToMarkdown = (html?: string | null) =>
  new Promise<string>((resolve, reject) => {
    if (!html) return resolve('');

    const start = Date.now();

    // worker
    const worker = new Worker(getWorkerPath('html2md'));

    worker.on('message', (md: string) => {
      worker.terminate();

      let rawText = simpleMarkdownText(md);

      resolve(rawText);
    });
    worker.on('error', (err) => {
      worker.terminate();
      reject(err);
    });

    worker.postMessage(html);
  });
