import { listContainerChildren } from '@fastgpt/workflow-core';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
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
