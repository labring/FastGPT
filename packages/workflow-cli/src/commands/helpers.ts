import {
  WorkflowValidationError,
  applyWorkflowCommand,
  builtinTemplateProvider,
  type WorkflowCommand
} from '@fastgpt/workflow-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CliArgumentError } from '../error';
import { createTranslator } from '../i18n';
import { readWorkflowFile, writeWorkflowFileAtomic } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';

export const requireString = (input: Record<string, unknown>, key: string) => {
  const value = input[key];
  if (typeof value !== 'string' || !value) {
    throw new CliArgumentError(`Missing --${key}`, { option: key });
  }
  return value;
};

export const runMutation = async ({
  command,
  input,
  context
}: {
  command: WorkflowCommand;
  input: Record<string, unknown>;
  context: CliContext;
}): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  const result = await applyWorkflowCommand({
    document,
    command,
    dependencies: {
      templateProvider: builtinTemplateProvider,
      locale: context.locale,
      translate: createTranslator(context.locale)
    }
  });
  if (input.dryRun !== true) {
    await writeWorkflowFileAtomic(context.dir, result.document);
  }
  return {
    changed: true,
    checksum: result.checksum,
    changes: result.changes,
    result: { dryRun: input.dryRun === true },
    warnings: result.warnings
  };
};

export const assertNoValidationErrors = (
  diagnostics: ReturnType<typeof import('@fastgpt/workflow-core').validateWorkflow>
) => {
  if (diagnostics.some((item) => item.severity === 'error')) {
    throw new WorkflowValidationError(diagnostics);
  }
};

export const readInputValue = async ({
  input,
  context,
  valueType
}: {
  input: Record<string, unknown>;
  context: CliContext;
  valueType?: string;
}) => {
  const valueOptions = ['value', 'valueJson', 'valueFile', 'valueEnv'].filter(
    (key) => input[key] !== undefined
  );
  if (valueOptions.length !== 1) {
    throw new CliArgumentError('Exactly one value option is required', { valueOptions });
  }

  if (typeof input.valueJson === 'string') {
    try {
      return JSON.parse(input.valueJson);
    } catch {
      throw new CliArgumentError('--value-json must contain valid JSON');
    }
  }
  const rawValue = (() => {
    if (typeof input.value === 'string') return input.value;
    if (typeof input.valueEnv === 'string') {
      const value = context.env[input.valueEnv];
      if (value === undefined) {
        throw new CliArgumentError('Environment variable is not defined', {
          name: input.valueEnv
        });
      }
      return value;
    }
    return undefined;
  })();
  const fileValue =
    typeof input.valueFile === 'string'
      ? input.valueFile === '-'
        ? await context.readStdin()
        : await readFile(resolve(context.cwd, input.valueFile), 'utf8')
      : undefined;
  const value = rawValue ?? fileValue;

  if (valueType === 'number') {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) throw new CliArgumentError('Value must be a number');
    return numberValue;
  }
  if (valueType === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new CliArgumentError('Value must be true or false');
  }
  if (valueType?.startsWith('array') || valueType === 'object') {
    try {
      return JSON.parse(value ?? '');
    } catch {
      throw new CliArgumentError('Structured input must contain valid JSON');
    }
  }
  return value;
};
