import { parentPort } from 'worker_threads';
import type { SplitProps } from '@fastgpt/global/common/string/textSplitter';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplitter';
import { workerResponse } from '../controller';
import { delay } from '@fastgpt/global/common/system/utils';

parentPort?.on('message', async (props: SplitProps) => {
  const result = splitText2Chunks(props);

  workerResponse({
    parentPort,
    status: 'success',
    data: result
  });
});
