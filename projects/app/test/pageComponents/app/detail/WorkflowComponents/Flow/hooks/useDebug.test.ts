import { describe, expect, it, vi } from 'vitest';
import { resetDebugNodeVariables } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebug';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('resetDebugNodeVariables', () => {
  it('only resets node inputs so global variables survive tool switching', () => {
    const resetField = vi.fn();

    resetDebugNodeVariables({
      resetField,
      inputs: [
        {
          key: 'query',
          label: 'Query',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: 'new tool default'
        }
      ]
    } as any);

    expect(resetField).toHaveBeenCalledTimes(1);
    expect(resetField).toHaveBeenCalledWith('nodeVariables', {
      defaultValue: expect.objectContaining({ query: 'new tool default' })
    });
  });
});
