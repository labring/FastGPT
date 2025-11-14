import type { MessagePort } from 'worker_threads';

export const workerResponse = ({
  parentPort,
  status,
  data
}: {
  parentPort: MessagePort | null;
  status: 'success' | 'error';
  data: any;
}) => {
  parentPort?.postMessage({
    type: status,
    data: data
  });

  process.exit();
};
