import { RunCodeDto, RunCodeResponse } from 'src/sandbox/dto/create-sandbox.dto';
import IsolatedVM, { ExternalCopy, Isolate, Reference } from 'isolated-vm';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import { countToken } from './jsFn/tiktoken';
import { timeDelay } from './jsFn/delay';
import { strToBase64 } from './jsFn/str2Base64';
import { createHmac } from './jsFn/crypto';

import { spawn } from 'child_process';
import { pythonScript } from './constants';
const CustomLogStr = 'CUSTOM_LOG';

export const runJsSandbox = async ({
  code,
  variables = {}
}: RunCodeDto): Promise<RunCodeResponse> => {
  /* 
    Rewrite code to add custom functions: Promise function; Log.
  */
  function getFnCode(code: string) {
    // rewrite log
    code = code.replace(/console\.log/g, `${CustomLogStr}`);

    // Promise function rewrite
    const rewriteSystemFn = `
    const thisDelay = (...args) => global_delay.applySyncPromise(undefined,args)
`;

    // rewrite delay
    code = code.replace(/delay\((.*)\)/g, `thisDelay($1)`);

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
  // Register global function
  function registerSystemFn(jail: IsolatedVM.Reference<Record<string | number | symbol, any>>) {
    return Promise.all([
      jail.set('global_delay', new Reference(timeDelay)),
      jail.set('countToken', countToken),
      jail.set('strToBase64', strToBase64),
      jail.set('createHmac', createHmac)
    ]);
  }

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

const PythonScriptFileName = 'main.py';
export const runPythonSandbox = async ({
  code,
  variables = {}
}: RunCodeDto): Promise<RunCodeResponse> => {
  // Validate input parameters
  if (!code || typeof code !== 'string' || !code.trim()) {
    return Promise.reject('Code cannot be empty');
  }

  // Ensure variables is an object
  if (variables === null || variables === undefined) {
    variables = {};
  }
  if (typeof variables !== 'object' || Array.isArray(variables)) {
    return Promise.reject('Variables must be an object');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'python_script_tmp_'));
  const dataJson = JSON.stringify({ code, variables, tempDir });
  const dataBase64 = Buffer.from(dataJson).toString('base64');
  const mainCallCode = `
import json
import base64
data = json.loads(base64.b64decode('${dataBase64}').decode('utf-8'))
res = run_pythonCode(data)
print(json.dumps(res))
`;

  const fullCode = [pythonScript, mainCallCode].filter(Boolean).join('\n');
  const { path: tempFilePath, cleanup } = await createTempFile(tempDir, fullCode);
  const pythonProcess = spawn('python3', ['-u', tempFilePath]);

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  pythonProcess.stdout.on('data', (data) => stdoutChunks.push(data.toString()));
  pythonProcess.stderr.on('data', (data) => stderrChunks.push(data.toString()));

  const stdoutPromise = new Promise<string>((resolve) => {
    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        resolve(JSON.stringify({ error: stderrChunks.join('') }));
      } else {
        resolve(stdoutChunks.join(''));
      }
    });
  });
  const stdout = await stdoutPromise.finally(() => {
    cleanup();
  });

  try {
    const parsedOutput = JSON.parse(stdout);
    if (parsedOutput.error) {
      return Promise.reject(parsedOutput.error || 'Unknown error');
    }
    return { codeReturn: parsedOutput, log: '' };
  } catch (err) {
    if (
      stdout.includes('malformed node or string on line 1') ||
      stdout.includes('invalid syntax (<unknown>, line 1)')
    ) {
      return Promise.reject(`The result should be a parsable variable, such as a list.  ${stdout}`);
    } else if (stdout.includes('Unexpected end of JSON input')) {
      return Promise.reject(`Not allowed print or ${stdout}`);
    }
    return Promise.reject(`Run failed: ${err}`);
  }
};

// write full code into a tmp file
async function createTempFile(tempFileDirPath: string, context: string) {
  const tempFilePath = join(tempFileDirPath, PythonScriptFileName);

  try {
    await writeFile(tempFilePath, context);
    return {
      path: tempFilePath,
      cleanup: () => {
        rmSync(tempFileDirPath, {
          recursive: true,
          force: true
        });
      }
    };
  } catch (err) {
    return Promise.reject(`write file err: ${err}`);
  }
}
