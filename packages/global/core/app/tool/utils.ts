import { AppToolSourceEnum } from '../tool/constants';

/**
  Tool id rule:
  - personal: ObjectId
  - commercial: commercial-ObjectId
  - systemtool: systemTool-id
  - mcp tool:  mcp-parentId/toolName
  (deprecated) community: community-id
*/
export function splitCombineToolId(id: string) {
  const splitRes = id.split('-');
  if (splitRes.length === 1) {
    // app id
    return {
      source: AppToolSourceEnum.personal,
      pluginId: id
    };
  }

  const [source, ...rest] = id.split('-') as [AppToolSourceEnum, string | undefined];
  const pluginId = rest.join('-');
  if (!source || !pluginId) throw new Error('pluginId not found');

  // 兼容4.10.0 之前的插件
  if (source === 'community' || id === 'commercial-dalle3') {
    return {
      source: AppToolSourceEnum.systemTool,
      pluginId: `${AppToolSourceEnum.systemTool}-${pluginId}`
    };
  }

  // mcp-appId, mcp-appId/toolname
  if (source === 'mcp') {
    const [parentId, toolName] = pluginId.split('/');
    return {
      source: AppToolSourceEnum.mcp,
      pluginId,
      authAppId: parentId
    };
  }
  if (source === 'http') {
    const [parentId, toolName] = pluginId.split('/');
    return {
      source: AppToolSourceEnum.http,
      pluginId,
      parentId
    };
  }
  if (source === 'personal') {
    return {
      source: AppToolSourceEnum.personal,
      pluginId,
      parentId: pluginId
    };
  }

  return { source, pluginId: id };
}

export const getToolRawId = (id: string) => {
  const toolId = splitCombineToolId(id).pluginId;

  // 兼容 toolset
  return toolId.split('/')[0];
};
