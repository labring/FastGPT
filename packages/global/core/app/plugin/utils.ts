import { StoreNodeItemType } from '../../workflow/type/node';
import { FlowNodeInputItemType } from '../../workflow/type/io';
import { FlowNodeTypeEnum } from '../../workflow/node/constant';

export const getPluginInputsFromStoreNodes = (nodes: StoreNodeItemType[]) => {
  return nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs || [];
};
export const getPluginRunContent = ({
  pluginInputs,
  variables
}: {
  pluginInputs: FlowNodeInputItemType[];
  variables: Record<string, any>;
}) => {
  const pluginInputsWithValue = pluginInputs.map((input) => {
    const { key } = input;
    const value = variables?.hasOwnProperty(key) ? variables[key] : input.defaultValue;
    return {
      ...input,
      value
    };
  });
  return JSON.stringify(pluginInputsWithValue);
};
