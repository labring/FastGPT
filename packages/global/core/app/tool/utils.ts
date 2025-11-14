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

  if (source === 'mcp') {
    return {
      source: AppToolSourceEnum.mcp,
      pluginId
    };
  }
  if (source === 'http') {
    return {
      source: AppToolSourceEnum.http,
      pluginId
    };
  }
  return { source, pluginId: id };
}
