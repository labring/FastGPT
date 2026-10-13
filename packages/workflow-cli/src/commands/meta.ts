import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
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
