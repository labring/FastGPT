import { describe, expect, it } from 'vitest';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DatasetTagFilterVersionEnum } from '@fastgpt/global/core/dataset/constants';
import {
  getDatasetSearchFilterVersion,
  upgradeLegacyDatasetSearchInputs
} from '@/web/core/workflow/datasetSearchNodeUpgrade';

const datasetInput = {
  key: NodeInputKeyEnum.datasetSelectList,
  label: '',
  renderTypeList: [],
  value: ['dataset']
};
const legacyInput = {
  key: NodeInputKeyEnum.collectionFilterMatch,
  label: '',
  renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter],
  value: '{"tags":{"$and":["legacy"]}}'
};
const versionInput = {
  key: NodeInputKeyEnum.collectionFilterVersion,
  label: '',
  renderTypeList: [FlowNodeInputTypeEnum.hidden],
  value: DatasetTagFilterVersionEnum.legacy
};

describe('dataset search node upgrade', () => {
  it('replaces only the legacy filter and version inputs', () => {
    const inputs = [datasetInput, legacyInput, versionInput];
    const filterInput = { ...legacyInput, value: { logic: 'AND', conditions: [] } };

    const upgraded = upgradeLegacyDatasetSearchInputs({ inputs, filterInput });

    expect(upgraded[0]).toBe(datasetInput);
    expect(upgraded).toHaveLength(3);
    expect(upgraded[2]).toBe(filterInput);
    expect(getDatasetSearchFilterVersion(upgraded)).toBe(DatasetTagFilterVersionEnum.structured);
    expect(getDatasetSearchFilterVersion(inputs)).toBe(DatasetTagFilterVersionEnum.legacy);
  });

  it('rejects replacing an unrelated input', () => {
    expect(() =>
      upgradeLegacyDatasetSearchInputs({ inputs: [datasetInput], filterInput: datasetInput })
    ).toThrow('Dataset search filter upgrade received an invalid filter input');
  });
});
