import { RunCodeDto, RunCodeResponse } from 'src/sandbox/dto/create-sandbox.dto';
import { parentPort } from 'worker_threads';
import { workerResponse } from './utils';

// @ts-ignore
const ivm = require('isolated-vm');

parentPort?.on('message', ({ code, variables = {} }: RunCodeDto) => {
  const resolve = (data: RunCodeResponse) => workerResponse({ parentPort, type: 'success', data });
  const reject = (error: any) => workerResponse({ parentPort, type: 'error', data: error });

  const isolate = new ivm.Isolate({ memoryLimit: 32 });
  const context = isolate.createContextSync();
  const jail = context.global;

  // custom function
  const logData = [];
  const CustomLogStr = 'CUSTOM_LOG';
  code = code.replace(/console\.log/g, `${CustomLogStr}`);
  jail.setSync(CustomLogStr, function (...args) {
    logData.push(
      args
        .map((item) => (typeof item === 'object' ? JSON.stringify(item, null, 2) : item))
        .join(', ')
    );
  });

  jail.setSync('responseData', function (args: any): any {
    if (typeof args === 'object') {
      resolve({
        codeReturn: args,
        log: logData.join('\n')
      });
    } else {
      reject('Not an invalid response, must return an object');
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
