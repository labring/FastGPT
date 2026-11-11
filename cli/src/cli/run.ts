import { CommanderError } from 'commander';
import type { ConfigRepository } from '../infra/config/config-repository';
import type { SecretStore } from '../infra/secrets/secret-store';
import type { Prompter } from '../infra/ui/prompter';
import { createOutputRenderer } from '../infra/ui/renderer';
import { CliArgumentError, CliError } from '../shared/errors';
import { CliExitCode, getCliVersion, type CliFetchFn, type CliFormat } from '../shared/types';
import { createCliContainer } from './container';
import { buildCommanderProgram } from './program';
import { buildCommandMetas, getCliCommandSpecs } from './registry';

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function resolvePreparseFormat({
  argv,
  env,
  isTTY
}: {
  argv: readonly string[];
  env: NodeJS.ProcessEnv;
  isTTY: boolean;
}): { format: CliFormat; explicitJson: boolean; quiet: boolean; color: boolean } {
  let explicitFormat: CliFormat | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--format=json' || (arg === '--format' && argv[i + 1] === 'json')) {
      explicitFormat = 'json';
    } else if (arg === '--format=text' || (arg === '--format' && argv[i + 1] === 'text')) {
      explicitFormat = 'text';
    }
  }

  const envFormat =
    env.FASTGPT_FORMAT === 'json' || env.FASTGPT_FORMAT === 'text' ? env.FASTGPT_FORMAT : undefined;
  const format: CliFormat = explicitFormat ?? envFormat ?? (isTTY ? 'text' : 'json');

  return {
    format,
    explicitJson:
      explicitFormat === 'json' || (explicitFormat === undefined && envFormat === 'json'),
    quiet: argv.includes('--quiet'),
    color: !argv.includes('--no-color') && isTTY
  };
}

/**
 * CLI 主运行入口；全部外部依赖均可注入以便单测完整隔离运行。
 */
export async function runCli({
  argv,
  cwd = process.cwd(),
  env = process.env,
  isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  fetchFn = globalThis.fetch,
  secretStore,
  configRepo,
  prompter,
  readStdin = defaultReadStdin,
  openExternal,
  stdout = (value) => process.stdout.write(`${value}\n`),
  stderr = (value) => process.stderr.write(`${value}\n`)
}: {
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  fetchFn?: CliFetchFn;
  secretStore?: SecretStore;
  configRepo?: ConfigRepository;
  prompter?: Prompter;
  readStdin?: () => Promise<string>;
  openExternal?: (targetPath: string) => Promise<boolean>;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
}): Promise<number> {
  const preparse = resolvePreparseFormat({ argv, env, isTTY });
  const commandGuess =
    argv
      .filter((item) => !item.startsWith('-'))
      .slice(0, 2)
      .join(' ') || 'fastgpt';

  const renderer = createOutputRenderer({
    format: preparse.format,
    color: preparse.color
  });

  // 显式指定 `--version --format json` 时输出 JSON 信封，普通 `--version` 保持纯版本号文本。
  if (
    preparse.explicitJson &&
    (argv.includes('--version') || argv.includes('-v')) &&
    !argv.includes('--help') &&
    !argv.includes('-h')
  ) {
    stdout(
      renderer.renderSuccess({
        command: 'version',
        result: { changed: false, data: { version: getCliVersion() } }
      })
    );
    return CliExitCode.success;
  }

  const container = createCliContainer({
    cwd,
    env,
    isTTY,
    explicitJson: preparse.explicitJson,
    format: preparse.format,
    quiet: preparse.quiet,
    fetchFn,
    secretStore,
    configRepo,
    prompter,
    readStdin,
    openExternal,
    stdout,
    stderr
  });

  const commanderErrBuffer: string[] = [];
  const specs = getCliCommandSpecs();
  const commandMetas = buildCommandMetas(specs);
  const program = buildCommanderProgram({
    specs,
    commandMetas,
    container,
    defaultFormat: preparse.format,
    defaultColor: preparse.color,
    stdout,
    onCommanderWriteErr: (str) => commanderErrBuffer.push(str)
  });

  try {
    await program.parseAsync(argv, { from: 'user' });
    return CliExitCode.success;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.help') {
        const text = commanderErrBuffer.join('').replace(/\n$/, '');
        if (text) {
          stdout(text);
        }
        return CliExitCode.success;
      }
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') {
        return CliExitCode.success;
      }

      const cleanMessage = error.message.replace(/^error:\s*/i, '').trim();
      const argError = new CliArgumentError(cleanMessage);
      stderr(renderer.renderError({ command: commandGuess, error: argError }));
      return argError.exitCode;
    }

    stderr(renderer.renderError({ command: commandGuess, error }));
    if (error instanceof CliError) {
      return error.exitCode;
    }
    return CliExitCode.internal;
  }
}
