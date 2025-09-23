import { type StoreNodeItemType } from '../../workflow/type/node';
import { type FlowNodeInputItemType } from '../../workflow/type/io';
import { FlowNodeTypeEnum } from '../../workflow/node/constant';
import { PluginSourceEnum } from './constants';

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

/**
  plugin id rule:
  - personal: ObjectId
  - commercial: commercial-ObjectId
  - systemtool: systemTool-id
  - mcp tool:  mcp-parentId/toolName
  (deprecated) community: community-id
*/
export function splitCombinePluginId(id: string) {
  const splitRes = id.split('-');
  if (splitRes.length === 1) {
    // app id
    return {
      source: PluginSourceEnum.personal,
      pluginId: id
    };
  }

  const [source, ...rest] = id.split('-') as [PluginSourceEnum, string | undefined];
  const pluginId = rest.join('-');
  if (!source || !pluginId) throw new Error('pluginId not found');

  // 兼容4.10.0 之前的插件
  if (source === 'community' || id === 'commercial-dalle3') {
    return {
      source: PluginSourceEnum.systemTool,
      pluginId: `${PluginSourceEnum.systemTool}-${pluginId}`
    };
  }

  if (source === 'mcp') {
    return {
      source: PluginSourceEnum.mcp,
      pluginId
    };
  }
  return { source, pluginId: id };
}
