import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

describe('NodeInputKeyEnum (refactored modelId keys+values)', () => {
  it('aiModelId should have value "modelId"', () => {
    // Refactored: key aiModel→aiModelId, value 'model'→'modelId'
    expect(NodeInputKeyEnum.aiModelId).toBe('modelId');
  });

  it('datasetSearchRerankModelId should have value "rerankModelId"', () => {
    // Refactored: key datasetSearchRerankModel→datasetSearchRerankModelId, value 'rerankModel'→'rerankModelId'
    expect(NodeInputKeyEnum.datasetSearchRerankModelId).toBe('rerankModelId');
  });

  it('datasetSearchExtensionModelId should have value "datasetSearchExtensionModelId"', () => {
    // Refactored: key+value changed to use ModelId suffix
    expect(NodeInputKeyEnum.datasetSearchExtensionModelId).toBe('datasetSearchExtensionModelId');
  });

  it('datasetDeepSearchModelId should have value "datasetDeepSearchModelId"', () => {
    // Refactored: key+value changed to use ModelId suffix
    expect(NodeInputKeyEnum.datasetDeepSearchModelId).toBe('datasetDeepSearchModelId');
  });
});
