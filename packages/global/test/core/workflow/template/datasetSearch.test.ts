import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';

describe('DatasetSearchModule', () => {
  it('should deprecate legacy user question input and add array search input', () => {
    const legacyUserQuestionInput = DatasetSearchModule.inputs.find(
      (input) => input.key === NodeInputKeyEnum.userChatInput
    );
    const searchInput = DatasetSearchModule.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchInput
    );

    expect(legacyUserQuestionInput?.valueType).toBe(WorkflowIOValueTypeEnum.string);
    expect(legacyUserQuestionInput?.deprecated).toBe(true);
    expect(searchInput?.valueType).toBe(WorkflowIOValueTypeEnum.arrayString);
  });
});
