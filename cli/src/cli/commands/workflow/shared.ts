import type { WorkflowValueInput } from '../../../domain/workflow/workflow-local-service';
import { CliArgumentError } from '../../../shared/errors';
import type { CommandOptionMeta } from '../../../shared/types';

export const WORKFLOW_DIR_OPTION: CommandOptionMeta = {
  name: 'dir',
  flags: '--dir <path>',
  takesValue: true,
  description: 'Workflow workspace directory (defaults to FASTGPT_WORKFLOW_DIR or ".")'
};

export const WORKFLOW_LOCALE_OPTION: CommandOptionMeta = {
  name: 'locale',
  flags: '--locale <locale>',
  takesValue: true,
  description: 'Descriptor locale (defaults to FASTGPT_WORKFLOW_LOCALE or "en")'
};

export const WORKFLOW_DRY_RUN_OPTION: CommandOptionMeta = {
  name: 'dryRun',
  flags: '--dry-run',
  takesValue: false,
  description: 'Validate and preview changes without modifying workflow.json or calling remote APIs'
};

export const WORKFLOW_VALUE_OPTIONS: readonly CommandOptionMeta[] = [
  { name: 'value', flags: '--value <text>', takesValue: true, description: 'Scalar value' },
  { name: 'valueJson', flags: '--value-json <json>', takesValue: true, description: 'JSON value' },
  {
    name: 'valueFile',
    flags: '--value-file <path>',
    takesValue: true,
    description: 'Read UTF-8 value from file ("-" for stdin)'
  },
  {
    name: 'valueEnv',
    flags: '--value-env <name>',
    takesValue: true,
    description: 'Read value from environment variable'
  }
];

export function resolveWorkflowDir(
  options: Record<string, unknown>,
  env: NodeJS.ProcessEnv
): string {
  if (typeof options.dir === 'string' && options.dir.trim().length > 0) {
    return options.dir.trim();
  }
  if (typeof env.FASTGPT_WORKFLOW_DIR === 'string' && env.FASTGPT_WORKFLOW_DIR.trim().length > 0) {
    return env.FASTGPT_WORKFLOW_DIR.trim();
  }
  return '.';
}

export function resolveWorkflowLocale(
  options: Record<string, unknown>,
  env: NodeJS.ProcessEnv
): string {
  if (typeof options.locale === 'string' && options.locale.trim().length > 0) {
    return options.locale.trim();
  }
  if (
    typeof env.FASTGPT_WORKFLOW_LOCALE === 'string' &&
    env.FASTGPT_WORKFLOW_LOCALE.trim().length > 0
  ) {
    return env.FASTGPT_WORKFLOW_LOCALE.trim();
  }
  return 'en';
}

export function requireNonEmptyOption(
  options: Record<string, unknown>,
  key: string,
  flagName: string
): string {
  const val = options[key];
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new CliArgumentError(`${flagName} is required.`);
  }
  return val;
}

export function optionalNonEmptyOption(
  options: Record<string, unknown>,
  key: string
): string | undefined {
  const val = options[key];
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return undefined;
}

export function extractValueInput(options: Record<string, unknown>): WorkflowValueInput {
  return {
    value: typeof options.value === 'string' ? options.value : undefined,
    valueJson: typeof options.valueJson === 'string' ? options.valueJson : undefined,
    valueFile: typeof options.valueFile === 'string' ? options.valueFile : undefined,
    valueEnv: typeof options.valueEnv === 'string' ? options.valueEnv : undefined
  };
}

export function countActiveValueOptions(options: Record<string, unknown>): number {
  return ['value', 'valueJson', 'valueFile', 'valueEnv'].filter((key) => options[key] !== undefined)
    .length;
}
