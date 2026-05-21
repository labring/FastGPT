import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';

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
  });
});
