import { describe, expect, it, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  getDatasetSearchFilterVersion,
  persistLegacyDatasetSearchNodeUpgrade
} from '@/web/core/workflow/datasetSearchNodeUpgrade';
import { DatasetTagFilterVersionEnum } from '@fastgpt/global/core/dataset/workflowTagFilter';

const legacyNode = {
  nodeId: 'dataset-node',
  name: 'Dataset search',
  flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
  version: '4.9.2',
  inputs: [
    { key: 'datasetSelectList', label: '', renderTypeList: [], value: ['dataset'] },
    {
      key: 'collectionFilterMatch',
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter],
      value: '{"tags":{"$and":["legacy"]}}'
    }
  ],
  outputs: [{ key: 'quoteQA', label: '', type: 'static' }]
} as any;
const upgradedInput = {
  ...legacyNode.inputs[1],
  value: { logic: 'AND', conditions: [] }
};
const versionInput = {
  key: 'collectionFilterVersion',
  label: '',
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  value: 'legacy'
} as any;

describe('dataset search node upgrade', () => {
  it('does not commit the local upgrade when persistence fails', async () => {
    const commit = vi.fn();
    const persist = vi.fn().mockRejectedValue(new Error('save failed'));
    await expect(
      persistLegacyDatasetSearchNodeUpgrade({
        nodes: [legacyNode],
        nodeId: legacyNode.nodeId,
        filterInput: upgradedInput,
        persist,
        commit
      })
    ).rejects.toThrow('save failed');
    expect(commit).not.toHaveBeenCalled();
  });

  it('persists and commits one canonical upgraded node without changing shared node data', async () => {
    const persist = vi.fn(async () => undefined);
    const commit = vi.fn();

    await persistLegacyDatasetSearchNodeUpgrade({
      nodes: [legacyNode],
      nodeId: legacyNode.nodeId,
      filterInput: upgradedInput,
      persist,
      commit
    });

    const persistedNode = persist.mock.calls[0][0][0];
    expect(commit).toHaveBeenCalledWith(persistedNode);
    expect(persistedNode).toMatchObject({
      nodeId: legacyNode.nodeId,
      name: legacyNode.name,
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      outputs: legacyNode.outputs
    });
    expect(persistedNode.inputs[0]).toEqual(legacyNode.inputs[0]);
    expect(persistedNode.inputs.find((input) => input.key === upgradedInput.key)).toEqual(
      upgradedInput
    );
    expect(getDatasetSearchFilterVersion(persistedNode.inputs)).toBe(
      DatasetTagFilterVersionEnum.structured
    );
    expect(persistedNode.inputs.filter((input) => input.key === versionInput.key)).toHaveLength(1);
  });
});
