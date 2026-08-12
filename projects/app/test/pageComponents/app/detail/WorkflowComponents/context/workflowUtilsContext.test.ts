import { describe, expect, it } from 'vitest';
import { splitToolInputsByMode } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';

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

  it('does not expose AI mode for an input that is not a tool parameter', () => {
    const input = {
      key: 'query',
      label: 'query',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([input], true);

    expect(result.commonInputs[0].renderTypeList).not.toContain(
      FlowNodeInputTypeEnum.agentGenerated
    );
    expect(result.commonInputs[0].selectedType).toBe(FlowNodeInputTypeEnum.input);
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

  it('keeps fixed tool inputs in the node and defaults the marked inputs to AI generation', () => {
    const toolCallInputs = splitToolInputsByMode(ToolCallNode.inputs, true).commonInputs;

    toolCallInputs
      .filter((input) =>
        [
          NodeInputKeyEnum.aiSystemPrompt,
          NodeInputKeyEnum.history,
          NodeInputKeyEnum.fileUrlList,
          NodeInputKeyEnum.userChatInput
        ].includes(input.key as NodeInputKeyEnum)
      )
      .forEach((input) => {
        expect(input.renderTypeList).toContain(FlowNodeInputTypeEnum.agentGenerated);
      });
    expect(
      toolCallInputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)?.selectedType
    ).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });
});
