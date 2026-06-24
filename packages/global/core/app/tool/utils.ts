import { AppToolSourceEnum } from '../tool/constants';
import { NodeInputKeyEnum } from '../../workflow/constants';
import type { StoreNodeItemType } from '../../workflow/type/node';
import type { SelectedToolItemType } from '../formEdit/type';

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
  source: AppToolSourceEnum | string;
  pluginId: string;
  authAppId?: string;
} {
  const debugTool = parseDebugToolId(id);
  if (debugTool) return debugTool;

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

const DebugToolIdPrefix = 'debug:';
const DebugToolIdSeparator = '|';

export function isDebugToolId(id?: string): id is string {
  return typeof id === 'string' && id.startsWith(DebugToolIdPrefix);
}

export function isDebugToolSource(source?: string): source is string {
  return typeof source === 'string' && source.startsWith(DebugToolIdPrefix);
}

export function parseDebugToolSource(source?: string): { tmbId: string } | undefined {
  if (!isDebugToolSource(source)) return;
  const tmbMatch = /^debug:tmbId:([^:]+)$/.exec(source);
  if (tmbMatch) {
    return {
      tmbId: tmbMatch[1]
    };
  }
}

export function encodeDebugToolId({ source, pluginId }: { source: string; pluginId: string }) {
  return `${source}${DebugToolIdSeparator}${pluginId}`;
}

export function parseDebugToolId(id: string):
  | {
      source: string;
      pluginId: string;
    }
  | undefined {
  if (!isDebugToolId(id)) return;

  const separatorIndex = id.lastIndexOf(DebugToolIdSeparator);
  if (separatorIndex <= DebugToolIdPrefix.length || separatorIndex === id.length - 1) {
    throw new Error('Invalid debug tool id');
  }

  return {
    source: id.slice(0, separatorIndex),
    pluginId: id.slice(separatorIndex + 1)
  };
}

export function hasDebugToolInSelectedTools(selectedTools?: SelectedToolItemType[] | null) {
  return (
    selectedTools?.some(
      (tool) =>
        isDebugToolId(tool.pluginId) || isDebugToolId(tool.id) || isDebugToolSource(tool.source)
    ) ?? false
  );
}

/**
 * 检查发布数据中是否包含本地调试工具。
 * 需要同时覆盖普通工具节点、工具集配置和 Agent 节点 selectedTools 输入，避免调试 source 被发布到线上版本。
 */
export function hasDebugToolInNodes(nodes?: StoreNodeItemType[] | null) {
  return (
    nodes?.some((node) => {
      if (isDebugToolId(node.pluginId) || isDebugToolSource(node.source)) return true;

      const toolConfig = node.toolConfig;
      if (isDebugToolId(toolConfig?.systemTool?.toolId)) return true;
      if (isDebugToolSource(toolConfig?.systemTool?.source)) return true;
      if (isDebugToolId(toolConfig?.systemToolSet?.toolId)) return true;
      if (isDebugToolSource(toolConfig?.systemToolSet?.source)) return true;
      if (toolConfig?.systemToolSet?.toolList?.some((tool) => isDebugToolId(tool.toolId))) {
        return true;
      }

      const selectedToolsInput = node.inputs.find(
        (input) => input.key === NodeInputKeyEnum.selectedTools
      );
      const selectedTools = Array.isArray(selectedToolsInput?.value)
        ? (selectedToolsInput.value as SelectedToolItemType[])
        : [];

      return hasDebugToolInSelectedTools(selectedTools);
    }) ?? false
  );
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
