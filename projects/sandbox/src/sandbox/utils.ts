import { RunCodeDto, RunCodeResponse } from 'src/sandbox/dto/create-sandbox.dto';
import IsolatedVM, { ExternalCopy, Isolate, Reference } from 'isolated-vm';
import { countToken } from './jsFn/tiktoken';
import { timeDelay } from './jsFn/delay';

const CustomLogStr = 'CUSTOM_LOG';

/* 
    Rewrite code to add custom functions: Promise function; Log.
  */
function getFnCode(code: string) {
  const rewriteSystemFn = `
    const thisDelay = (...args) => global_delay.applySyncPromise(undefined,args)
`;

  // rewrite delay
  code = code.replace(/delay\((.*)\)/g, `thisDelay($1)`);

  // rewrite log
  code = code.replace(/console\.log/g, `${CustomLogStr}`);

  const runCode = `
    (async() => { 
        try {
            ${rewriteSystemFn}
            ${code}

            const res = await main(variables, {})
            return JSON.stringify(res);
        } catch(err) {
            return JSON.stringify({ERROR: err?.message ?? err})
        }
    })
`;
  return runCode;
}

function registerSystemFn(jail: IsolatedVM.Reference<Record<string | number | symbol, any>>) {
  return Promise.all([
    // delay
    jail.set('global_delay', new Reference(timeDelay)),
    jail.set('countToken', countToken)
  ]);
}

export const runSandbox = async ({
  code,
  variables = {}
}: RunCodeDto): Promise<RunCodeResponse> => {
  const logData = [];

  const isolate = new Isolate({ memoryLimit: 32 });
  const context = await isolate.createContext();
  const jail = context.global;

  try {
    // Add global variables
    await Promise.all([
      jail.set('variables', new ExternalCopy(variables).copyInto()),
      jail.set(CustomLogStr, function (...args) {
        logData.push(
          args
            .map((item) => (typeof item === 'object' ? JSON.stringify(item, null, 2) : item))
            .join(', ')
        );
      }),
      registerSystemFn(jail)
    ]);

    // Run code
    const fn = await context.eval(getFnCode(code), { reference: true, timeout: 10000 });

    try {
      // Get result and parse
      const value = await fn.apply(undefined, [], { result: { promise: true } });
      const result = JSON.parse(value.toLocaleString());

      //   release memory
      context.release();
      isolate.dispose();

      if (result.ERROR) {
        return Promise.reject(result.ERROR);
      }

      return {
        codeReturn: result,
        log: logData.join('\n')
      };
    } catch (error) {
      context.release();
      isolate.dispose();
      return Promise.reject('Not an invalid response.You must return an object');
    }
  } catch (err) {
    console.log(err);

    context.release();
    isolate.dispose();
    return Promise.reject(err);
  }
};
