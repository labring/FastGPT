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
      defaultToAgentGenerated: true,
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

  it('keeps manually configured editable tool params in tool inputs', () => {
    const toolInput = {
      key: 'query',
      label: 'query',
      canEdit: true,
      isToolParam: true,
      selectedType: FlowNodeInputTypeEnum.input,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([toolInput], true);

    expect(result.toolInputs).toEqual([toolInput]);
    expect(result.commonInputs).toEqual([]);
  });

  it('keeps unmarked editable inputs as code custom variables', () => {
    const customVariable = {
      key: 'codeInput',
      label: 'codeInput',
      canEdit: true,
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([customVariable], true);

    expect(result.toolInputs).toEqual([]);
    expect(result.commonInputs.map((input) => input.key)).toEqual(['codeInput']);
  });

  it('keeps the same input in common inputs when it is not a tool', () => {
    const input = {
      key: 'query',
      label: 'query',
      canEdit: true,
      toolDescription: 'Search query',
      defaultToAgentGenerated: true,
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([input], false);

    expect(result.toolInputs).toEqual([]);
    expect(result.commonInputs).toHaveLength(1);
  });
});
