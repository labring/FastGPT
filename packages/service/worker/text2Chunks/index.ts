import { parentPort } from 'worker_threads';
import type { SplitProps } from '../../common/string/textSplitter';
import { splitText2Chunks } from '../../common/string/textSplitter';

type IncomingMessage = {
  id: string;
} & SplitProps;

parentPort?.on('message', async (props: IncomingMessage) => {
  const { id, ...splitProps } = props;

  try {
    const result = splitText2Chunks(splitProps);

    parentPort?.postMessage({ id, type: 'success', data: result });
  } catch (error) {
    parentPort?.postMessage({ id, type: 'error', data: error });
  }
});
