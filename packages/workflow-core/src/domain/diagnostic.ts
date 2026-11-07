import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import z from 'zod';

export const WorkflowDiagnosticSeveritySchema = z.enum(['error', 'warning']);

export const WorkflowDiagnosticSchema = z.object({
  code: z.enum(WorkflowDiagnosticCodeEnum),
  severity: WorkflowDiagnosticSeveritySchema,
  path: z.array(z.union([z.string(), z.number()])).optional(),
  nodeId: z.string().optional(),
  inputKey: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional()
});

export type WorkflowDiagnostic = z.infer<typeof WorkflowDiagnosticSchema>;

export class WorkflowCommandError extends Error {
  readonly code = WorkflowDiagnosticCodeEnum.commandFailed;

  constructor(readonly diagnostics: WorkflowDiagnostic[]) {
    super(diagnostics[0]?.code ?? WorkflowDiagnosticCodeEnum.commandFailed);
    this.name = 'WorkflowCommandError';
  }
}

export class WorkflowValidationError extends Error {
  readonly code = WorkflowDiagnosticCodeEnum.validationFailed;

  constructor(readonly diagnostics: WorkflowDiagnostic[]) {
    super(diagnostics[0]?.code ?? WorkflowDiagnosticCodeEnum.validationFailed);
    this.name = 'WorkflowValidationError';
  }
}
