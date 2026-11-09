import { describe, expect, it } from 'vitest';
import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { countNewReferenceIssues } from '@/pageComponents/app/detail/WorkflowComponents/Flow/components/utils';

describe('countNewReferenceIssues', () => {
  it('counts newly broken reference fields and deduplicates one field', () => {
    expect(
      countNewReferenceIssues(
        [{ nodeId: 'old', level: 'error', code: 'invalid_reference', inputKey: 'value' }],
        [
          { nodeId: 'old', level: 'error', code: 'invalid_reference', inputKey: 'value' },
          { nodeId: 'new', level: 'error', code: 'invalid_reference', inputKey: 'value' },
          { nodeId: 'new', level: 'error', code: 'invalid_reference_type', inputKey: 'value' },
          {
            nodeId: 'diagnostic',
            level: 'error',
            code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch,
            inputKey: 'value'
          },
          { nodeId: 'new', level: 'error', code: 'required_input_empty', inputKey: 'other' }
        ]
      )
    ).toBe(2);
  });
});
