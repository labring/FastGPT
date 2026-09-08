import { describe, expect, it } from 'vitest';
import { restoreDatasetParams } from '@/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeAgent/utils';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

describe('restoreDatasetParams', () => {
  it('restores saved model IDs into empty fields and preserves them when editing similarity', () => {
    const inputs = AgentNode.inputs.map((input) => ({
      ...input,
      value:
        input.key === NodeInputKeyEnum.datasetSearchRerankModelId
          ? 'saved-rerank'
          : input.key === NodeInputKeyEnum.datasetSearchExtensionModelId
            ? 'saved-llm'
            : input.value
    }));
    const state = {
      rerankModelId: undefined,
      datasetSearchExtensionModelId: undefined,
      similarity: 0.5
    };
    const restored = restoreDatasetParams({ state, inputs });
    expect(restored).toMatchObject({
      rerankModelId: 'saved-rerank',
      datasetSearchExtensionModelId: 'saved-llm'
    });
    const edited = { ...restored, similarity: 0.8 };
    expect(
      restoreDatasetParams({
        state: edited,
        inputs: inputs.filter((input) => input.key !== NodeInputKeyEnum.datasetSimilarity)
      })
    ).toBe(edited);
    expect(state.rerankModelId).toBeUndefined();
  });

  it('ignores unrelated inputs, preserves defaults for missing values and avoids unnecessary updates', () => {
    const state = { rerankModelId: 'saved', similarity: 0 };
    expect(restoreDatasetParams({ state, inputs: [] })).toBe(state);
    const inputs = AgentNode.inputs.filter(
      (input) => input.key !== NodeInputKeyEnum.datasetSimilarity
    );
    expect(restoreDatasetParams({ state, inputs })).toBe(state);
  });
});
