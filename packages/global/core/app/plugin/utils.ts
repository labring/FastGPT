import { StoreNodeItemType } from '../../workflow/type/node';
import { FlowNodeInputItemType } from '../../workflow/type/io';
import { FlowNodeTypeEnum } from '../../workflow/node/constant';

export const getPluginInputsFromStoreNodes = (nodes: StoreNodeItemType[]) => {
  return nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs || [];
};
export const getPluginRunContent = (e: { pluginInputs: FlowNodeInputItemType[] }) => {
  return JSON.stringify(e);
};
