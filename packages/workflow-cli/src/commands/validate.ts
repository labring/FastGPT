import {
  collectWorkflowBindings,
  getWorkflowBindingDiagnostics,
  validateWorkflow
} from '@fastgpt/workflow-core';
import { readWorkflowFile } from '../io/workflowFile';
import type { CliContext, CliResult } from '../type';
import { assertNoValidationErrors } from './helpers';

export const validateDocument = async (
  _input: Record<string, unknown>,
  context: CliContext
): Promise<CliResult> => {
  const document = await readWorkflowFile(context.dir);
  const diagnostics = validateWorkflow(document);
  assertNoValidationErrors(diagnostics);
  const bindings = collectWorkflowBindings(document);
  const bindingDiagnostics = getWorkflowBindingDiagnostics(bindings);
  return {
    changed: false,
    result: { valid: true, executable: bindings.length === 0, diagnostics, bindings },
    warnings: bindingDiagnostics
  };
};
