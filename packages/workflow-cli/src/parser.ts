import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { CliArgumentError } from './error';
import { cliCommandRegistry, globalCliOptions, getCommandName } from './registry';
import type { CliCommandDefinition, CliContext, CliOptionDefinition } from './type';

const toInputKey = (optionName: string) =>
  optionName.slice(2).replace(/-([a-z])/g, (_, character: string) => character.toUpperCase());

const findOption = (name: string, options: readonly CliOptionDefinition[]) =>
  options.find((option) => option.name === name);

export type ParsedCliCommand = {
  definition: CliCommandDefinition;
  input: Record<string, unknown>;
  context: CliContext;
  help: boolean;
};

/** Registry 是命令、参数校验和帮助文本的唯一来源。 */
export const parseCliArgs = ({
  argv,
  cwd,
  env
}: {
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}): ParsedCliCommand => {
  const positional: string[] = [];
  const rawOptions: Record<string, string | true> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const option = findOption(token, [
      ...globalCliOptions,
      ...cliCommandRegistry.flatMap((definition) => definition.options)
    ]);
    if (!option) throw new CliArgumentError(`Unknown option: ${token}`);
    if (option.value) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliArgumentError(`Option requires a value: ${token}`);
      }
      rawOptions[toInputKey(token)] = value;
      index += 1;
    } else {
      rawOptions[toInputKey(token)] = true;
    }
  }

  const definition = cliCommandRegistry.find(
    (item) =>
      item.path.length === positional.length &&
      item.path.every((part, index) => positional[index] === part)
  );
  if (!definition) {
    throw new CliArgumentError(
      positional.length === 0 ? 'Command is required' : `Unknown command: ${positional.join(' ')}`
    );
  }

  const allowedCommandOptions = new Set(definition.options.map((item) => toInputKey(item.name)));
  const globalOptionKeys = new Set(globalCliOptions.map((item) => toInputKey(item.name)));
  for (const key of Object.keys(rawOptions)) {
    if (!globalOptionKeys.has(key) && !allowedCommandOptions.has(key)) {
      throw new CliArgumentError(`Option is not valid for ${getCommandName(definition)}`, {
        option: key
      });
    }
  }

  const commandInput = Object.fromEntries(
    Object.entries(rawOptions).filter(([key]) => allowedCommandOptions.has(key))
  );
  let input: Record<string, unknown>;
  if (rawOptions.help === true) {
    input = {};
  } else {
    try {
      input = definition.inputSchema.parse(commandInput) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new CliArgumentError('Command options are invalid', { issues: error.issues });
      }
      throw error;
    }
  }

  const format = rawOptions.format ?? env.FASTGPT_WORKFLOW_FORMAT ?? 'text';
  if (format !== 'text' && format !== 'json') {
    throw new CliArgumentError('--format must be text or json');
  }
  const dirValue = rawOptions.dir ?? env.FASTGPT_WORKFLOW_DIR ?? '.';
  if (typeof dirValue !== 'string') throw new CliArgumentError('--dir must be a path');

  return {
    definition,
    input,
    help: rawOptions.help === true,
    context: {
      cwd,
      dir: resolve(cwd, dirValue),
      format,
      locale:
        typeof rawOptions.locale === 'string'
          ? rawOptions.locale
          : (env.FASTGPT_WORKFLOW_LOCALE ?? 'en'),
      quiet: rawOptions.quiet === true,
      color: rawOptions.noColor !== true,
      env,
      readStdin: async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks).toString('utf8');
      }
    }
  };
};
