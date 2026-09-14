import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DatasetTagFilterVersionEnum,
  resolveDatasetTagFilterVersion
} from '@fastgpt/global/core/dataset/workflowTagFilter';
import { Input_Template_Dataset_Tag_Filter_Version } from '@fastgpt/global/core/workflow/template/input';

/** 从节点输入读取唯一的过滤版本来源，不检查 collectionFilterMatch 的值形状。 */
export const getDatasetSearchFilterVersion = (inputs: FlowNodeInputItemType[]) =>
  resolveDatasetTagFilterVersion({
    version: inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterVersion)?.value,
    filterValue: inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterMatch)?.value
  });

export const datasetSearchUsesLegacyFilter = (inputs: FlowNodeInputItemType[]) =>
  getDatasetSearchFilterVersion(inputs) === DatasetTagFilterVersionEnum.legacy;

/** 只更新过滤版本和过滤输入，nodeId、节点类型、其他参数及连线引用保持不变。 */
export const upgradeLegacyDatasetSearchNode = ({
  node,
  filterInput
}: {
  node: StoreNodeItemType;
  filterInput: FlowNodeInputItemType;
}): StoreNodeItemType => {
  if (filterInput.key !== NodeInputKeyEnum.collectionFilterMatch) {
    throw new Error('Dataset search filter upgrade received an invalid filter input');
  }
  const structuredVersionInput = {
    ...Input_Template_Dataset_Tag_Filter_Version,
    value: DatasetTagFilterVersionEnum.structured
  };
  const inputs = node.inputs
    .filter(
      (input) =>
        input.key !== NodeInputKeyEnum.collectionFilterVersion &&
        input.key !== NodeInputKeyEnum.collectionFilterMatch
    )
    .concat(structuredVersionInput, filterInput);

  return {
    ...node,
    inputs
  };
};

/** 先持久化再提交本地升级；持久化失败时 commit 不会执行。 */
export const persistLegacyDatasetSearchNodeUpgrade = async ({
  nodes,
  nodeId,
  filterInput,
  persist,
  commit
}: {
  nodes: StoreNodeItemType[];
  nodeId: string;
  filterInput: FlowNodeInputItemType;
  persist: (nodes: StoreNodeItemType[]) => Promise<void>;
  commit: (node: StoreNodeItemType) => void;
}) => {
  let upgradedNode: StoreNodeItemType | undefined;
  const upgradedNodes = nodes.map((node) => {
    if (node.nodeId !== nodeId) return node;
    upgradedNode = upgradeLegacyDatasetSearchNode({ node, filterInput });
    return upgradedNode;
  });
  if (!upgradedNode) throw new Error(`Dataset search node not found: ${nodeId}`);

  await persist(upgradedNodes);
  commit(upgradedNode);
};
