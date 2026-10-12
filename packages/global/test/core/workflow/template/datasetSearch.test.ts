import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  getToolInputDisplayRenderTypeList,
  normalizeFlowNodeInputType
} from '@fastgpt/global/core/app/formEdit/utils';

describe('DatasetSearchModule', () => {
  it('should use array search input without legacy user question input', () => {
    const legacyUserQuestionInput = DatasetSearchModule.inputs.find(
      (input) => input.key === NodeInputKeyEnum.userChatInput
    );
    const searchInput = DatasetSearchModule.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchInput
    );

    expect(legacyUserQuestionInput).toBeUndefined();
    expect(searchInput?.valueType).toBe(WorkflowIOValueTypeEnum.arrayString);
    expect(searchInput?.renderTypeList).toContain(FlowNodeInputTypeEnum.textarea);
  });

  it('should keep the search query on textarea when the node is used as a tool', () => {
    const searchInput = DatasetSearchModule.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchInput
    );
    const toolInput = normalizeFlowNodeInputType(searchInput!, { isTool: true });

    // 作为工具时默认交给 AI 生成；手动输入沿用节点声明的 textarea，不投影成 JSON 编辑器。
    expect(toolInput.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(
      getToolInputDisplayRenderTypeList({ input: toolInput, showAgentGenerated: true })
    ).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.textarea,
      FlowNodeInputTypeEnum.reference
    ]);
  });
});
