import { parentPort } from 'worker_threads';
import { workerResponse } from '../controller';
import { parseDatasetBackup2Chunks } from '../../core/dataset/utils';

// 这里导入所有需要在worker中运行的同步函数
// 后续可以根据需要添加更多函数
const availableFunctions: Record<string, Function> = {
  parseDatasetBackup2Chunks
};

interface SyncFunctionCall {
  functionName: keyof typeof availableFunctions;
  args: any[];
}

parentPort?.on('message', (props: SyncFunctionCall) => {
  try {
    const func = availableFunctions[props.functionName];

    if (!func) {
      throw new Error(`Function '${props.functionName}' is not available in syncFunction worker`);
    }

    // 调用函数并传入参数
    const result = func(...props.args);

    workerResponse({
      parentPort,
      status: 'success',
      data: result
    });
  } catch (error) {
    workerResponse({
      parentPort,
      status: 'error',
      data: error instanceof Error ? error.message : String(error)
    });
  }
});
