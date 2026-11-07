import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  WorkflowCheckIssueCodeEnum,
  WorkflowDiagnosticCodeEnum
} from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  WorkflowCheckIssueSchema,
  type WorkflowCheckIssue
} from '@fastgpt/global/core/workflow/type/node';
import {
  WorkflowCommandError,
  WorkflowDiagnosticSchema,
  WorkflowValidationError,
  type WorkflowDiagnostic
} from '../../src/domain/diagnostic';

describe('workflow diagnostic codes', () => {
  it('requires enum members in TypeScript while preserving the serialized protocol value', () => {
    expectTypeOf<WorkflowDiagnostic['code']>().toEqualTypeOf<WorkflowDiagnosticCodeEnum>();
    expectTypeOf<WorkflowCheckIssue['code']>().toEqualTypeOf<
      WorkflowDiagnosticCodeEnum | WorkflowCheckIssueCodeEnum
    >();
    expectTypeOf<'WORKFLOW_REFERENCE_TYPE_MISMATCH'>().not.toMatchTypeOf<
      WorkflowDiagnostic['code']
    >();

    const diagnostic = WorkflowDiagnosticSchema.parse({
      code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch,
      severity: 'error'
    });
    expect(JSON.parse(JSON.stringify(diagnostic))).toEqual({
      code: 'WORKFLOW_REFERENCE_TYPE_MISMATCH',
      severity: 'error'
    });
    expect(
      WorkflowCheckIssueSchema.shape.code.parse(WorkflowCheckIssueCodeEnum.invalidReference)
    ).toBe(WorkflowCheckIssueCodeEnum.invalidReference);
    expect(WorkflowCheckIssueSchema.shape.code.parse(diagnostic.code)).toBe(diagnostic.code);
  });

  it.each(['WORKFLOW_REFERENCE_TYP_MISMATCH', 'NEW_ERROR', ''])(
    'rejects unregistered code %j at both diagnostic and UI boundaries',
    (code) => {
      expect(WorkflowDiagnosticSchema.safeParse({ code, severity: 'error' }).success).toBe(false);
      expect(WorkflowCheckIssueSchema.shape.code.safeParse(code).success).toBe(false);
    }
  );
});

describe.each([
  { ErrorClass: WorkflowCommandError, code: WorkflowDiagnosticCodeEnum.commandFailed },
  { ErrorClass: WorkflowValidationError, code: WorkflowDiagnosticCodeEnum.validationFailed }
])('$ErrorClass.name', ({ ErrorClass, code }) => {
  it('uses enum codes for the wrapper and its default or diagnostic message', () => {
    expect(new ErrorClass([])).toMatchObject({ code, message: code });
    const diagnostics: WorkflowDiagnostic[] = [
      { code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch, severity: 'error' }
    ];
    expect(new ErrorClass(diagnostics)).toMatchObject({
      code,
      diagnostics,
      message: WorkflowDiagnosticCodeEnum.referenceTypeMismatch
    });
  });
});
