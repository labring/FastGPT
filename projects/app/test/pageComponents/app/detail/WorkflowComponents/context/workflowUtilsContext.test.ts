import { describe, expect, it } from 'vitest';
import { splitToolInputsByMode } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('splitToolInputsByMode', () => {
  it('keeps Agent-generated editable inputs out of common inputs', () => {
    const toolInput = {
      key: 'query',
      label: 'query',
      canEdit: true,
      toolDescription: 'Search query',
      isToolParam: true,
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };
    const commonInput = {
      key: 'url',
      label: 'url',
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([toolInput, commonInput], true);

    expect(result.toolInputs).toEqual([toolInput]);
    expect(result.commonInputs.map((input) => input.key)).toEqual(['url']);
  });

  it('keeps the same input in common inputs when it is not a tool', () => {
    const input = {
      key: 'query',
      label: 'query',
      canEdit: true,
      toolDescription: 'Search query',
      isToolParam: true,
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([input], false);

    expect(result.toolInputs).toEqual([]);
    expect(result.commonInputs).toHaveLength(1);
  });
});
