import { parentPort } from 'worker_threads';
import { html2md } from './utils';

type IncomingMessage = {
  id: string;
  html: string;
};

parentPort?.on('message', (params: IncomingMessage) => {
  const { id, html } = params;

  try {
    const md = html2md(html || '');

    parentPort?.postMessage({ id, type: 'success', data: md });
  } catch (error) {
    parentPort?.postMessage({ id, type: 'error', data: error });
  }
});
