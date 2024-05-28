import { RunCodeDto } from 'src/sandbox/dto/create-sandbox.dto';
import { parentPort } from 'worker_threads';
import { workerResponse } from './utils';

// @ts-ignore
const ivm = require('isolated-vm');

parentPort?.on('message', ({ code, variables = {} }: RunCodeDto) => {
  const resolve = (data: any) => workerResponse({ parentPort, type: 'success', data });
  const reject = (error: any) => workerResponse({ parentPort, type: 'error', data: error });

  const isolate = new ivm.Isolate({ memoryLimit: 32 });
  const context = isolate.createContextSync();
  const jail = context.global;

  // custom log function
  jail.setSync('responseData', function (args: any): any {
    if (typeof args === 'object') {
      resolve(args);
    } else {
      reject('Not an invalid response');
    }
  });

  // Add global variables
  jail.setSync('variables', new ivm.ExternalCopy(variables).copyInto());

  try {
    const scriptCode = `
      ${code}
      responseData(main(variables))`;
    context.evalSync(scriptCode, { timeout: 6000 });
  } catch (err) {
    reject(err);
  }

  process.exit();
});
