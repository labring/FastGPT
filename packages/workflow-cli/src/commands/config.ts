import {
  option,
  emptySchema,
  valueOptionShape,
  valueOptions,
  getValueOptionCount
} from '../commandOptions';
import z from 'zod';
import {
  getChatConfigDescriptor,
  listChatConfigDescriptors
} from '@fastgpt/workflow-core/config/descriptor';
import { createTranslator } from '@fastgpt/web/i18n/workflowTemplate';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { readInputValue, requireString, runMutation } from './helpers';

export const listConfig = async (
  _input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  return {
    changed: false,
    result: listChatConfigDescriptors({
      document,
      translate: createTranslator(context.locale)
    })
  };
};

export const getConfig = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const path = requireString(input, 'path');
  return {
    changed: false,
    result: getChatConfigDescriptor({
      document: await readWorkflowFile(context.dir),
      path,
      translate: createTranslator(context.locale)
    })
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

/** config 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const configCommands: CliCommandDefinition[] = [
  {
    path: ['config', 'list'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: listConfig
  },
  {
    path: ['config', 'get'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: z.object({ path: z.string().min(1) }).strict(),
    options: [option('--path', 'Allowlisted ChatConfig path', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: getConfig
  },
  {
    path: ['config', 'set'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        path: z.string().min(1),
        ...valueOptionShape,
        dryRun: z.literal(true).optional()
      })
      .strict()
      .refine((value) => getValueOptionCount(value) === 1),
    options: [
      option('--path', 'Allowlisted ChatConfig path', { required: true }),
      ...valueOptions,
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: setConfig
  },
  {
    path: ['config', 'unset'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z.object({ path: z.string().min(1), dryRun: z.literal(true).optional() }).strict(),
    options: [
      option('--path', 'Allowlisted ChatConfig path', { required: true }),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: unsetConfig
  }
];
