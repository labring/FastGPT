import { option, emptySchema } from '../commandOptions';
import z from 'zod';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { runMutation } from './helpers';

export const showMeta = async (
  _input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => ({
  changed: false,
  result: (await readWorkflowFile(context.dir)).app
});

export const setMeta = async (
  input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> =>
  runMutation({
    input,
    context,
    command: {
      type: 'meta.update',
      name: typeof input.name === 'string' ? input.name : undefined,
      intro: typeof input.intro === 'string' ? input.intro : undefined
    }
  });

/** meta 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const metaCommands: CliCommandDefinition[] = [
  {
    path: ['meta', 'show'],
    introducedIn: 'PR2',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: showMeta
  },
  {
    path: ['meta', 'set'],
    introducedIn: 'PR2',
    kind: 'localMutation',
    inputSchema: z
      .object({
        name: z.string().min(1).optional(),
        intro: z.string().optional(),
        dryRun: z.literal(true).optional()
      })
      .strict()
      .refine((value) => value.name !== undefined || value.intro !== undefined),
    options: [
      option('--name', 'Application name'),
      option('--intro', 'Application introduction'),
      option('--dry-run', 'Return changes without writing', { value: false })
    ],
    supportsDryRun: true,
    confirm: 'none',
    handler: setMeta
  }
];
