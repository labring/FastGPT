import { parentPort } from 'worker_threads';
import { html2md } from './utils';

parentPort?.on('message', (params: { html: string }) => {
  try {
    const md = html2md(params?.html || '');

    parentPort?.postMessage({
      type: 'success',
      data: md
    });
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      data: error
    });
  }
  process.exit();
});
