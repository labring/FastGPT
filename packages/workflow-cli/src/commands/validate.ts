import { emptySchema } from '../commandOptions';
import {
  collectWorkflowBindings,
  getWorkflowBindingDiagnostics
} from '@fastgpt/workflow-core/binding/service';
import { validateWorkflow } from '@fastgpt/workflow-core/validation';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult, CliCommandDefinition } from '../type';
import { assertNoValidationErrors } from './helpers';

export const validateDocument = async (
  _input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  const diagnostics = validateWorkflow(document, { invalidReferencePolicy: 'error' });
  assertNoValidationErrors(diagnostics);
  const bindings = collectWorkflowBindings(document);
  const bindingDiagnostics = getWorkflowBindingDiagnostics(bindings);
  return {
    changed: false,
    result: { valid: true, executable: bindings.length === 0, diagnostics, bindings },
    warnings: bindingDiagnostics
  };
};

/** validate 命令定义与执行逻辑在同一模块维护；注册器只负责收集。 */
export const validateCommands: CliCommandDefinition[] = [
  {
    path: ['validate'],
    introducedIn: 'PR1',
    kind: 'query',
    inputSchema: emptySchema,
    options: [],
    supportsDryRun: false,
    confirm: 'none',
    handler: validateDocument
  }
];
