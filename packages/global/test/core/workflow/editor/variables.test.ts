import { describe, expect, it } from 'vitest';
import { mergeWorkflowSystemVariables } from '@fastgpt/global/common/workflow/editor/variables';
import { workflowSystemVariables } from '@fastgpt/global/core/workflow/node/constant';

describe('mergeWorkflowSystemVariables', () => {
  it('lets system variables override same-key app variables', () => {
    const merged = mergeWorkflowSystemVariables([
      { key: 'custom', label: 'Custom' },
      { key: 'userId', label: 'Configured user id' }
    ]);

    expect(merged.map(({ key }) => key)).toEqual([
      'custom',
      ...workflowSystemVariables.map(({ key }) => key)
    ]);
    expect(merged.find(({ key }) => key === 'userId')).toEqual(
      workflowSystemVariables.find(({ key }) => key === 'userId')
    );
  });
});
