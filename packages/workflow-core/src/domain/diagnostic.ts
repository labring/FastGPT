import z from 'zod';

export const WorkflowDiagnosticSeveritySchema = z.enum(['error', 'warning']);

export const WorkflowDiagnosticSchema = z.object({
  code: z.string(),
  severity: WorkflowDiagnosticSeveritySchema,
  path: z.array(z.union([z.string(), z.number()])).optional(),
  nodeId: z.string().optional(),
  inputKey: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional()
});

export type WorkflowDiagnostic = z.infer<typeof WorkflowDiagnosticSchema>;

export class WorkflowCommandError extends Error {
  readonly code = 'WORKFLOW_COMMAND_FAILED';

  constructor(readonly diagnostics: WorkflowDiagnostic[]) {
    super(diagnostics[0]?.code ?? 'WORKFLOW_COMMAND_FAILED');
    this.name = 'WorkflowCommandError';
  }
}

export class WorkflowValidationError extends Error {
  readonly code = 'WORKFLOW_VALIDATION_FAILED';

  constructor(readonly diagnostics: WorkflowDiagnostic[]) {
    super(diagnostics[0]?.code ?? 'WORKFLOW_VALIDATION_FAILED');
    this.name = 'WorkflowValidationError';
  }
}
