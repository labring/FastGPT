import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DatasetTagFilterVersionEnum } from '@fastgpt/global/core/dataset/constants';
import { resolveDatasetTagFilterVersion } from '@fastgpt/global/core/dataset/search/tagFilter';
import { Input_Template_Dataset_Tag_Filter_Version } from '@fastgpt/global/core/workflow/template/input';

/** 从节点输入读取唯一的过滤版本来源，不检查 collectionFilterMatch 的值形状。 */
export const getDatasetSearchFilterVersion = (
  inputs: readonly DeepReadonly<FlowNodeInputItemType>[]
) =>
  resolveDatasetTagFilterVersion({
    version: inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterVersion)?.value,
    filterValue: inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterMatch)?.value
  });

export const datasetSearchUsesLegacyFilter = (inputs: FlowNodeInputItemType[]) =>
  getDatasetSearchFilterVersion(inputs) === DatasetTagFilterVersionEnum.legacy;

/** 替换筛选配置和版本参数，保留其余输入的顺序和值。 */
export const upgradeLegacyDatasetSearchInputs = ({
  inputs,
  filterInput
}: {
  inputs: readonly DeepReadonly<FlowNodeInputItemType>[];
  filterInput: FlowNodeInputItemType;
}) => {
  if (filterInput.key !== NodeInputKeyEnum.collectionFilterMatch) {
    throw new Error('Dataset search filter upgrade received an invalid filter input');
  }
  const structuredVersionInput = {
    ...Input_Template_Dataset_Tag_Filter_Version,
    value: DatasetTagFilterVersionEnum.structured
  };
  return inputs
    .filter(
      (input) =>
        input.key !== NodeInputKeyEnum.collectionFilterVersion &&
        input.key !== NodeInputKeyEnum.collectionFilterMatch
    )
    .concat(structuredVersionInput, filterInput);
};
