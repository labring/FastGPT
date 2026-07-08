import { parentPort } from 'worker_threads';
import type { SplitProps } from '../../common/string/textSplitter';
import { splitText2ChunksByLengthUnit } from './split';

type IncomingMessage = {
  id: string;
} & SplitProps;

parentPort?.on('message', async (props: IncomingMessage) => {
  const { id, ...splitProps } = props;

  try {
    const result = splitText2ChunksByLengthUnit(splitProps);

    parentPort?.postMessage({ id, type: 'success', data: result });
  } catch (error) {
    parentPort?.postMessage({ id, type: 'error', data: error });
  }
});
