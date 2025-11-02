import { type StoreNodeItemType } from '../../../workflow/type/node';
import { FlowNodeTypeEnum } from '../../../workflow/node/constant';

export const getWorkflowToolInputsFromStoreNodes = (nodes: StoreNodeItemType[]) => {
  return nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs || [];
};
