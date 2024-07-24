import { RunCodeDto, RunCodeResponse } from 'src/sandbox/dto/create-sandbox.dto';
import { parentPort } from 'worker_threads';
import { workerResponse } from './utils';
import { Reference } from 'isolated-vm';
import { countToken } from './jsFn/tiktoken';
import { timeDelay } from './jsFn/delay';

// @ts-ignore
const ivm = require('isolated-vm');
const CustomLogStr = 'CUSTOM_LOG';

function registerSystemFn(jail: any) {
  return Promise.all([
    // delay
    jail.set('global_delay', new Reference(timeDelay)),
    jail.set('global_countToken', new Reference(countToken))
  ]);
}

/* 
  Rewrite code to add custom function
  - delay
  - countToken
  - log
*/
function getFnCode(code: string) {
  const rewriteSystemFn = `
      const thisDelay = (...args) => global_delay.applySyncPromise(undefined,args)
      const thisCountToken = (...args) => global_countToken.applySyncPromise(undefined,args)
  `;

  /* rewrite code */

  // rewrite delay
  code = code.replace(/delay\((.*)\)/g, `thisDelay($1)`);
  code = code.replace(/countToken\((.*)\)/g, `thisCountToken($1)`);

  // rewrite log
  code = code.replace(/console\.log/g, `${CustomLogStr}`);

  return `
    (async() => { 
      ${rewriteSystemFn}
      ${code}

      const res = await main(variables,{})
      return JSON.stringify(res);
    })
  `;
}

parentPort?.on('message', async ({ code, variables = {} }: RunCodeDto) => {
  const resolve = (data: RunCodeResponse) => workerResponse({ parentPort, type: 'success', data });
  const reject = (error: any) => workerResponse({ parentPort, type: 'error', data: error });

  try {
    const isolate = new ivm.Isolate({ memoryLimit: 32 });
    const context = await isolate.createContext();
    const jail = context.global;

    // custom function
    const logData = [];
    await jail.set(CustomLogStr, function (...args) {
      logData.push(
        args
          .map((item) => (typeof item === 'object' ? JSON.stringify(item, null, 2) : item))
          .join(', ')
      );
    });

    await registerSystemFn(jail);

    // Add global variables
    await jail.set('variables', new ivm.ExternalCopy(variables).copyInto());

    const fn = await context.eval(getFnCode(code), { reference: true, timeout: 10000 });
    const value = await fn.apply(undefined, [], { result: { promise: true } });

    try {
      const result = JSON.parse(value);
      resolve({
        codeReturn: result,
        log: logData.join('\n')
      });
    } catch (error) {
      reject('Not an invalid response.You must return an object');
    }
  } catch (err) {
    console.log(err);
    reject(err);
  }

  process.exit();
});
