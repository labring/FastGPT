import { describe, expect, it } from 'vitest';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { getInvalidOutputKeys } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useNodeOutputValidity';

describe('workflow editor output validity', () => {
  it('keeps editor-only invalid output keys derived from current conditions', () => {
    const outputs = [
      { id: 'static', key: 'static', invalid: true },
      {
        id: 'condition-true',
        key: 'condition-true',
        invalidCondition: () => true
      },
      {
        id: 'condition-false',
        key: 'condition-false',
        invalid: true,
        invalidCondition: () => false
      }
    ] as FlowNodeOutputItemType[];

    const invalidOutputKeys = getInvalidOutputKeys({
      inputs: [] as FlowNodeInputItemType[],
      outputs,
      llmModelMap: {}
    });

    expect([...invalidOutputKeys]).toEqual(['static', 'condition-true']);
  });
});
