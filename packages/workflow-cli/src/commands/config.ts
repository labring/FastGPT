import { CHAT_CONFIG_PATHS, getChatConfigValue } from '@fastgpt/workflow-core';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
import { readInputValue, requireString, runMutation } from './helpers';

export const listConfig = async (
  _input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  return {
    changed: false,
    result: CHAT_CONFIG_PATHS.map((path) => ({ path, value: getChatConfigValue(document, path) }))
  };
};

export const getConfig = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const path = requireString(input, 'path');
  return {
    changed: false,
    result: { path, value: getChatConfigValue(await readWorkflowFile(context.dir), path) }
  };
};

export const setConfig = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'config.set',
      path: requireString(input, 'path'),
      value: await readInputValue({ input, context })
    }
  });

export const unsetConfig = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: { type: 'config.unset', path: requireString(input, 'path') }
  });
