import { parentPort } from 'worker_threads';
import { html2md } from './utils';
import { workerResponse } from '../controller';

parentPort?.on('message', (params: { html: string }) => {
  try {
    const md = html2md(params?.html || '');

    workerResponse({
      parentPort,
      status: 'success',
      data: md
    });
  } catch (error) {
    workerResponse({
      parentPort,
      status: 'error',
      data: error
    });
  }
});
