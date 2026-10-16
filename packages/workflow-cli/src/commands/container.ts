import { option } from '../commandOptions';
import z from 'zod';
import { listContainerChildren } from '@fastgpt/workflow-core/nesting/query';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { requireString } from './helpers';

export const listChildren = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  return {
    changed: false,
    result: listContainerChildren(document, requireString(input, 'node'))
  };
};

/** container 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const containerCommands: CliCommandDefinition[] = [
  {
    path: ['container', 'children'],
    introducedIn: 'PR3',
    kind: 'query',
    inputSchema: z.object({ node: z.string().min(1) }).strict(),
    options: [option('--node', 'Container node ID', { required: true })],
    supportsDryRun: false,
    confirm: 'none',
    handler: listChildren
  }
];
