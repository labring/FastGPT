import { RunCodeDto, RunCodeResponse } from 'src/sandbox/dto/create-sandbox.dto';
import IsolatedVM, { ExternalCopy, Isolate, Reference } from 'isolated-vm';

import { countToken } from './jsFn/tiktoken';
import { timeDelay } from './jsFn/delay';
import { strToBase64 } from './jsFn/str2Base64';
import { createHmac } from './jsFn/crypto';

import { spawn } from 'child_process';
import { seccompPrefix } from './constants';
const CustomLogStr = 'CUSTOM_LOG';

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

export const runJsSandbox = async ({
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

function getImportsAndCleanedCode(code: string): { imports: string[]; cleanedCode: string } {
  const importRegex = /^\s*(import\s+[\w., ]+|from\s+[\w.]+\s+import\s+[\w., ]+)(\s*#.*)?$/gm;
  const printRegex = /^\s*print\(.*?\)\s*;?/gms;

  const imports = Array.from(code.matchAll(importRegex)).map((match) => match[0].trim());

  const cleanedCode = code.replace(importRegex, '').replace(printRegex, '');

  return { imports, cleanedCode };
}

function getVariableDefinitionsCode(variables: Record<string, any>): string {
  return Object.entries(variables)
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key} = ${JSON.stringify(value)}`;
      return `${key} = ${JSON.stringify(value, (_, v) => {
        if (typeof v === 'boolean') return v ? 'True' : 'False';
        if (v === null) return 'None';
        return v;
      })}`;
    })
    .join('\n');
}

function getMainCallCode(variables: Record<string, any>): string {
  const variableKeys = Object.keys(variables);
  const mainArgs = variableKeys.length > 0 ? variableKeys.join(', ') : '';
  return `
try:
    res = main(${mainArgs})
    print(json.dumps(res, default=type_converter))
except Exception as e:
    print(json.dumps({"ERROR": str(e)}))
`;
}

export const runPythonSandbox = async ({
  code,
  variables = {}
}: RunCodeDto): Promise<RunCodeResponse> => {
  const { imports, cleanedCode } = getImportsAndCleanedCode(code);
  const importsCode = imports.join('\n');
  const variablesCode = getVariableDefinitionsCode(variables);
  const mainCallCode = getMainCallCode(variables);

  const fullCode = [importsCode, seccompPrefix, variablesCode, cleanedCode, mainCallCode]
    .filter(Boolean)
    .join('\n');

  const pythonProcess = spawn('python3', ['-u', '-c', fullCode], {
    timeout: 10000
  });

  const stdoutPromise = new Promise<string>((resolve) => {
    const chunks: string[] = [];
    pythonProcess.stdout.on('data', (data) => chunks.push(data.toString()));
    pythonProcess.stdout.on('end', () => resolve(chunks.join('')));
  });

  const stderrPromise = new Promise<string>((resolve) => {
    const chunks: string[] = [];
    pythonProcess.stderr.on('data', (data) => chunks.push(data.toString()));
    pythonProcess.stderr.on('end', () => resolve(chunks.join('')));
  });

  const { exitCode, signal } = await new Promise<{ exitCode: number; signal: string | null }>(
    (resolve, reject) => {
      pythonProcess.on('close', (code, signal) => {
        resolve({ exitCode: code === null ? -1 : code, signal });
      });
      pythonProcess.on('error', (err) => {
        reject(err);
      });
    }
  );

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  if (signal === 'SIGTERM') {
    throw new Error(`Sandbox timeout or Sandbox violation ${stderr}`);
  }
  if (exitCode !== 0) {
    throw new Error(`Python execution failed (code ${exitCode}): ${stderr}`);
  }

  try {
    const parsedOutput = JSON.parse(stdout);
    if (parsedOutput.ERROR) {
      throw new Error(parsedOutput.ERROR);
    }
    return {
      codeReturn: parsedOutput,
      log: stderr || ''
    };
  } catch (err) {
    throw new Error(`Invalid JSON output: ${stdout}`);
  }
};
