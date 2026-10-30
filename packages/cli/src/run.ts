import { FastGPT } from '@fastgpt-sdk/client';
import { FastGPTError } from '@fastgpt-sdk/client/error';
import type { DatasetInput, DatasetOperation } from '@fastgpt-sdk/client/dataset/type';
import { openAsBlob, createWriteStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { datasetCommands } from './commands';
import { buildInput, parseArguments } from './parser';

type RunOptions = {
  argv: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  fetch?: typeof globalThis.fetch;
  stdin?: () => Promise<string>;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
};

/** CLI 只处理终端输入输出，所有远程请求与训练等待都通过 SDK 执行。 */
export const runCli = async ({
  argv,
  env = process.env,
  cwd = process.cwd(),
  fetch,
  stdin = async () => {
    let text = '';
    for await (const chunk of process.stdin) text += chunk;
    return text;
  },
  stdout = (value) => {
    process.stdout.write(`${value}\n`);
  },
  stderr = (value) => {
    process.stderr.write(`${value}\n`);
  }
}: RunOptions): Promise<number> => {
  let format = 'json';
  try {
    const { command, flags } = parseArguments(argv);
    const one = (name: string) => {
      const matches = flags.filter((flag) => flag.name === name);
      if (matches.length > 1) throw new TypeError(`--${name} may only be specified once`);
      if (matches.length && matches[0].value === undefined)
        throw new TypeError(`--${name} requires a value`);
      return matches[0]?.value;
    };
    format = one('format') ?? 'json';
    if (!['json', 'text'].includes(format)) throw new TypeError('--format expects json or text');
    const enabled = (name: string) => {
      const matches = flags.filter((flag) => flag.name === name || flag.name === `no-${name}`);
      if (matches.length > 1) throw new TypeError(`--${name} may only be specified once`);
      if (!matches.length) return false;
      const flag = matches[0];
      if (flag.value !== undefined && !['true', 'false'].includes(flag.value))
        throw new TypeError(`--${name} expects true or false`);
      return flag.name === name && flag.value !== 'false';
    };
    if (enabled('json')) format = 'json';
    if (flags.some((flag) => flag.name === 'version')) {
      stdout('0.1.0');
      return 0;
    }
    const definition = datasetCommands.find((item) => item.command === command);
    const waitCommand = command === 'dataset collection wait';
    if (flags.some((flag) => flag.name === 'help') || command === '') {
      const lines = [
        'FastGPT CLI',
        '',
        'Authentication: FASTGPT_BASE_URL and FASTGPT_API_KEY (or --base-url and --api-key).',
        'Input: --input params.json, --input - or --params JSON; schema fields also accept --kebab-case flags.',
        'Search: --dataset-id ID (repeatable) --text QUERY --mode mixedRecall --rerank.',
        'Files: --file PATH; --wait waits for the imported collection using the public detail API.',
        'Downloads: --output PATH or --output - to write raw data to stdout.',
        'Output: --format json|text; result goes to stdout and errors go to stderr.',
        '',
        ...(definition
          ? [
              `${definition.command}: ${definition.description}`,
              `SDK operation: datasets.${definition.operation}`
            ]
          : datasetCommands
              .filter((item) => !command || item.command.startsWith(command))
              .map((item) => `${item.command.padEnd(48)} ${item.description}`)),
        'dataset collection wait --collection-id ID'
      ];
      stdout(lines.join('\n'));
      return 0;
    }
    if (!definition && !waitCommand) throw new TypeError(`Unknown command: ${command}`);
    const wait = enabled('wait');
    const waitableOperations = new Set<DatasetOperation>([
      'collections.importText',
      'collections.importUrl',
      'collections.importFile'
    ]);
    if (wait && !waitCommand && !waitableOperations.has(definition!.operation)) {
      throw new TypeError('--wait requires an operation that creates a single collection');
    }
    const output = one('output');
    if (definition && 'download' in definition) {
      if (!output) throw new TypeError('Download commands require --output PATH (or --output -)');
    } else if (output) throw new TypeError('--output is only supported by download commands');
    const fileFlags = flags.filter((flag) => flag.name === 'file');
    if (definition && 'upload' in definition) {
      if (!fileFlags.length || (definition.upload === 'file' && fileFlags.length !== 1))
        throw new TypeError('Specify the required --file path(s)');
    } else if (fileFlags.length) throw new TypeError('This command does not accept --file');

    const baseURL = one('base-url') ?? env.FASTGPT_BASE_URL;
    const apiKey = one('api-key') ?? env.FASTGPT_API_KEY;
    if (!baseURL || !apiKey)
      throw new TypeError(
        'Set FASTGPT_BASE_URL and FASTGPT_API_KEY, or pass --base-url and --api-key'
      );
    const numberOption = (name: string, fallback: number) => {
      const value = one(name);
      const number = value === undefined ? fallback : Number(value);
      if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647)
        throw new TypeError(`--${name} expects an integer between 1 and 2147483647`);
      return number;
    };
    const client = new FastGPT({
      baseURL,
      apiKey,
      fetch,
      timeoutMs: numberOption('timeout', 60000)
    });
    const inputFile = one('input');
    const json = one('params');
    if (inputFile && json) throw new TypeError('--input and --params cannot be combined');
    const base: unknown = inputFile
      ? JSON.parse(
          inputFile === '-' ? await stdin() : await readFile(resolve(cwd, inputFile), 'utf8')
        )
      : json
        ? JSON.parse(json)
        : {};
    const globalFlags = new Set([
      'base-url',
      'api-key',
      'format',
      'json',
      'no-json',
      'input',
      'params',
      'file',
      'output',
      'timeout',
      'wait',
      'no-wait',
      'wait-timeout',
      'poll-interval'
    ]);
    const operation: DatasetOperation = definition?.operation ?? 'collections.get';
    const input = buildInput(
      operation,
      flags
        .filter((flag) => !globalFlags.has(flag.name))
        .map((flag) =>
          waitCommand && flag.name === 'collection-id' ? { ...flag, name: 'id' } : flag
        ),
      base
    );
    const files = await Promise.all(
      flags
        .filter((flag) => flag.name === 'file')
        .map(async (flag) => {
          if (!flag.value) throw new TypeError('--file requires a path');
          const path = resolve(cwd, flag.value);
          return { file: await openAsBlob(path), filename: basename(path) };
        })
    );
    const waitOptions = {
      waitTimeoutMs: numberOption('wait-timeout', 300000),
      pollIntervalMs: numberOption('poll-interval', 1000)
    };
    let result: unknown = waitCommand
      ? await client.datasets.collections.waitForReady(
          input as DatasetInput<'collections.get'>,
          waitOptions
        )
      : await client.datasets.execute(
          operation,
          input as DatasetInput<typeof operation>,
          {},
          files.length ? files : undefined
        );

    if (result instanceof Response) {
      if (!result.body) throw new Error('Download response has no body');
      const stream = Readable.fromWeb(result.body as Parameters<typeof Readable.fromWeb>[0]);
      if (output === '-') {
        await pipeline(stream, process.stdout);
        return 0;
      }
      const path = resolve(cwd, output!);
      const target = createWriteStream(path, { flags: 'wx' });
      let created = false;
      target.once('open', () => {
        created = true;
      });
      try {
        await pipeline(stream, target);
      } catch (error) {
        if (created) await rm(path, { force: true });
        throw error;
      }
      result = { path };
    } else if (wait) {
      if (
        !result ||
        typeof result !== 'object' ||
        !('collectionId' in result) ||
        typeof result.collectionId !== 'string'
      ) {
        throw new TypeError('--wait requires an operation that creates a collection');
      }
      result = {
        ...result,
        training: await client.datasets.collections.waitForReady(
          { id: result.collectionId },
          waitOptions
        )
      };
    }
    stdout(
      JSON.stringify(
        result === undefined ? { success: true } : result,
        null,
        format === 'text' ? 2 : undefined
      )
    );
    return 0;
  } catch (error) {
    const usage = error instanceof TypeError || error instanceof SyntaxError;
    const message =
      error instanceof SyntaxError
        ? 'Input must contain valid JSON'
        : error instanceof Error
          ? error.message
          : 'Command failed';
    const details = error instanceof FastGPTError ? error.details : undefined;
    stderr(format === 'text' ? message : JSON.stringify({ error: { message, ...details } }));
    return usage ? 2 : 1;
  }
};
