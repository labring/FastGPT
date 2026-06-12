import { AppToolSourceEnum } from '../tool/constants';

/**
  Tool id rule:
  - personal: ObjectId(旧版), personal-objectId(新版)
  - commercial: commercial-ObjectId
  - systemtool: systemTool-id
  - mcp toolset: appId
  - mcp tool pluginId: mcp-appId/toolname
  - http toolset: appId
  - http tool pluginId: http-appId/toolname
  (deprecated) community: community-id
*/
export function splitCombineToolId(id: string): {
  source: AppToolSourceEnum;
  pluginId: string;
  authAppId?: string;
} {
  const splitRes = id.split('-');
  if (splitRes.length === 1) {
    // app id
    return {
      source: AppToolSourceEnum.personal,
      pluginId: id,
      authAppId: id
    };
  }

  const [source, ...rest] = id.split('-') as [AppToolSourceEnum, string | undefined];
  const toolId = rest.join('-');
  if (!source || !toolId) throw new Error('toolId not found');

  // 兼容4.10.0 之前的插件
  if (source === 'community' || id === 'commercial-dalle3') {
    return {
      source: AppToolSourceEnum.systemTool,
      pluginId: toolId
    };
  }

  if (source === AppToolSourceEnum.systemTool) {
    return {
      source: AppToolSourceEnum.systemTool,
      pluginId: toolId
    };
  }
  if (source === AppToolSourceEnum.commercial) {
    return {
      source: AppToolSourceEnum.commercial,
      pluginId: toolId
    };
  }

  // mcp-appId, mcp-appId/toolname
  if (source === AppToolSourceEnum.mcp) {
    const [parentId] = toolId.split('/');
    return {
      source: AppToolSourceEnum.mcp,
      pluginId: toolId,
      authAppId: parentId
    };
  }
  if (source === AppToolSourceEnum.http) {
    const [parentId] = toolId.split('/');
    return {
      source: AppToolSourceEnum.http,
      pluginId: toolId,
      authAppId: parentId
    };
  }
  if (source === AppToolSourceEnum.personal) {
    return {
      source: AppToolSourceEnum.personal,
      pluginId: toolId,
      authAppId: toolId
    };
  }

  throw new Error('Invalid tool id');
}

export const getToolRawId = (id: string) => {
  const toolId = splitCombineToolId(id).pluginId;

  // 兼容 toolset
  return toolId.split('/')[0];
};

/**
 * 拆分 MCP/HTTP 子工具 pluginId，保留 toolName 内部的 `/`。
 * pluginId 格式为 appId/toolName；toolName 可能本身以 `/` 开头，例如 appId//test。
 */
export const splitToolsetToolPluginId = (pluginId: string) => {
  const [parentId, ...toolNameParts] = pluginId.split('/');
  return {
    parentId,
    toolName: toolNameParts.join('/')
  };
};

/**
 * 从完整组合工具 ID 中解析 MCP/HTTP 子工具信息。
 */
export const parseToolsetToolId = (id: string) => {
  const { pluginId } = splitCombineToolId(id);
  return splitToolsetToolPluginId(pluginId);
};

/**
 * 生成工具名查找候选。优先使用完整 toolName；旧版 appId/toolsetName/toolName
 * 持久化数据在完整名查不到时回退到最后一段。
 */
export const getToolNameCandidates = (toolName?: string) => {
  if (!toolName) return [];

  const candidates = [toolName];
  const lastSegment = toolName.split('/').at(-1);
  if (lastSegment && lastSegment !== toolName) {
    candidates.push(lastSegment);
  }

  return candidates;
};
