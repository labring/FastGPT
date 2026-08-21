import { WorkflowCommandError, WorkflowValidationError } from '@fastgpt/workflow-core';
import { ZodError } from 'zod';
import { createInterface } from 'node:readline/promises';
import { CliArgumentError } from './error';
import { renderHelp } from './help';
import { renderError, renderSuccess } from './output/render';
import { parseCliArgs } from './parser';
import { loadCliTemplateProvider } from './template/provider';

export const CLI_VERSION = '0.3.0-beta.1' as const;

export const runCli = async ({
  argv,
  cwd = process.cwd(),
  env = process.env,
  isTTY = Boolean(process.stdin.isTTY && process.stderr.isTTY),
  stdin,
  requestConfirmation,
  stdout = (value) => process.stdout.write(`${value}\n`),
  stderr = (value) => process.stderr.write(`${value}\n`)
}: {
  argv: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  isTTY?: boolean;
  stdin?: () => Promise<string>;
  requestConfirmation?: (targetChecksum: string) => Promise<boolean>;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
}): Promise<number> => {
  const formatOptionIndex = argv.lastIndexOf('--format');
  const requestedFormat = formatOptionIndex >= 0 ? argv[formatOptionIndex + 1] : undefined;
  let command =
    argv
      .filter((item) => !item.startsWith('--'))
      .slice(0, 2)
      .join(' ') || 'unknown';
  let format: 'text' | 'json' =
    requestedFormat === 'json' ||
    (requestedFormat === undefined && env.FASTGPT_WORKFLOW_FORMAT === 'json')
      ? 'json'
      : 'text';
  try {
    if (argv.length === 0 || (argv.length === 1 && argv[0] === '--help')) {
      stdout(renderHelp());
      return 0;
    }
    if (argv.length === 1 && argv[0] === '--version') {
      stdout(CLI_VERSION);
      return 0;
    }

    const parsed = parseCliArgs({ argv, cwd, env });
    const templateProvider = await loadCliTemplateProvider(env);
    const context = {
      ...parsed.context,
      templateProvider,
      isTTY,
      ...(stdin ? { readStdin: stdin } : {}),
      requestConfirmation:
        requestConfirmation ??
        (async (targetChecksum: string) => {
          const readline = createInterface({ input: process.stdin, output: process.stderr });
          try {
            const answer = await readline.question(
              `Apply workflow plan ${targetChecksum}? Type "yes" to continue: `
            );
            return answer.trim().toLowerCase() === 'yes';
          } finally {
            readline.close();
          }
        })
    };
    command = parsed.definition.path.join(' ');
    format = parsed.context.format;
    if (parsed.help) {
      stdout(renderHelp(parsed.definition));
      return 0;
    }
    const result = await parsed.definition.handler(parsed.input, context);
    stdout(renderSuccess({ command, result, format }));
    return 0;
  } catch (error) {
    const mapped = (() => {
      if (error instanceof CliArgumentError || error instanceof ZodError) {
        return {
          exitCode: 2,
          code: error instanceof CliArgumentError ? error.code : 'CLI_ARGUMENT_INVALID',
          params: error instanceof CliArgumentError ? error.params : error.issues
        };
      }
      if (error instanceof WorkflowCommandError) {
        return { exitCode: 3, code: error.code, diagnostics: error.diagnostics };
      }
      if (error instanceof WorkflowValidationError) {
        return { exitCode: 4, code: error.code, diagnostics: error.diagnostics };
      }
      return { exitCode: 1, code: 'CLI_INTERNAL_ERROR' };
    })();
    stderr(
      renderError({
        command,
        code: mapped.code,
        diagnostics: 'diagnostics' in mapped ? mapped.diagnostics : undefined,
        params: 'params' in mapped ? mapped.params : undefined,
        format
      })
    );
    return mapped.exitCode;
  }
};
