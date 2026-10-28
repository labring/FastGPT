import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
export class CliArgumentError extends Error {
  constructor(
    message: string,
    readonly params?: Record<string, unknown>,
    readonly code: WorkflowDiagnosticCodeEnum = WorkflowDiagnosticCodeEnum.cliArgumentInvalid
  ) {
    super(message);
    this.name = 'CliArgumentError';
  }
}
