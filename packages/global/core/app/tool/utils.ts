import { AppToolSourceEnum } from '../tool/constants';
import { NodeInputKeyEnum } from '../../workflow/constants';
import { FlowNodeTypeEnum } from '../../workflow/node/constant';
import type { NodeToolConfigType, StoreNodeItemType } from '../../workflow/type/node';
import type { SelectedToolItemType } from '../formEdit/type';
import { hashStr } from '../../../common/string/tools';

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

/**
 * 判断工具是否允许使用旧版 toolDescription 推断 AI 参数。
 * 该兼容仅覆盖工作流工具和旧系统/商业工具，其他工具继续使用自身 schema annotation。
 */
export const shouldUseLegacyToolDescriptionFallback = ({
  toolId,
  flowNodeType
}: {
  toolId?: string;
  flowNodeType?: FlowNodeTypeEnum;
}) => {
  if (flowNodeType === FlowNodeTypeEnum.pluginModule) return true;
  if (!toolId) return false;

  try {
    const { source } = splitCombineToolId(toolId);
    return source === AppToolSourceEnum.systemTool || source === AppToolSourceEnum.commercial;
  } catch {
    return false;
  }
};

export const isSystemOrCommercialToolId = (toolId?: string) => {
  if (!toolId) return false;

  try {
    const { source } = splitCombineToolId(toolId);
    return source === AppToolSourceEnum.systemTool || source === AppToolSourceEnum.commercial;
  } catch {
    return false;
  }
};

const DebugToolSourcePrefix = 'debug:tmbId:';
const TeamPluginSourcePrefix = 'teamId:';

/** 工具身份由 source 与 id 共同决定，避免系统/团队同名插件互相覆盖。 */
export const getToolIdentityKey = (id?: string, source?: string) =>
  `${source || 'system'}:${id || ''}`;

/**
 * 引用键里可以明确识别的工具来源：`system:<id>`、`teamId:<teamId>:<id>`、
 * `debug:tmbId:<tmbId>:<id>`。其他写法（组合 ID、裸 ObjectId 等）视为无来源。
 * 按已知来源形态匹配，避免把 `mcp-appId/tool` 这类 pluginId 误当作来源。
 */
export const parseToolReferenceKey = (key: string): { source?: string; id: string } => {
  const trimmedKey = typeof key === 'string' ? key.trim() : '';
  if (!trimmedKey) return { id: '' };

  const teamMatch = /^(teamId:[^:]+):(.+)$/.exec(trimmedKey);
  if (teamMatch) {
    return { source: teamMatch[1], id: teamMatch[2] };
  }

  const debugMatch = /^(debug:tmbId:[^:]+):(.+)$/.exec(trimmedKey);
  if (debugMatch) {
    return { source: debugMatch[1], id: debugMatch[2] };
  }

  if (trimmedKey.startsWith('system:')) {
    const id = trimmedKey.slice('system:'.length);
    if (id) return { source: 'system', id };
  }

  return { id: trimmedKey };
};

/** 引用键是否带明确来源。带来源的引用只在同一来源命名空间内解析。 */
export const isSourcedToolReferenceKey = (key: string): boolean =>
  Boolean(parseToolReferenceKey(key).source);

/**
 * 构造工具引用键的匹配候选（按优先级去重）。
 *
 * 提示词中的工具引用可能来自不同版本：`<source>:<id>` 身份键、`teamId:xxx:<id>`、
 * 组合工具 ID（`mcp-appId/tool`）、或历史数据里的裸 id。解析出明确来源后，
 * 候选只在同一来源命名空间内生成，避免同 ID 不同来源的工具互相命中；
 * 无来源的裸键也不会生成任何带来源的候选。
 */
export const getToolReferenceKeyCandidates = (key: string): string[] => {
  const trimmedKey = typeof key === 'string' ? key.trim() : '';
  if (!trimmedKey) return [];

  const { source, id } = parseToolReferenceKey(trimmedKey);
  const candidates: string[] = [];
  const pushCandidate = (candidate?: string) => {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };
  // 有来源时保持来源前缀，保证候选不会漂移到其他来源或裸键命名空间。
  const withSource = (value?: string) => {
    if (!value) return undefined;
    return source ? `${source}:${value}` : value;
  };

  pushCandidate(trimmedKey);
  pushCandidate(withSource(id));
  try {
    const { pluginId } = splitCombineToolId(id);
    const runtimeId = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');
    pushCandidate(withSource(pluginId));
    pushCandidate(withSource(runtimeId));
  } catch {
    // 非组合工具 ID 只使用原值解析。
  }

  return candidates;
};

/**
 * 工具引用统一匹配规则（编辑器与运行时共用，避免两侧包裹范围/键字符不一致）：
 * ≥2 层花括号 + `@key@`，key 不允许包含花括号与 @；捕获组 3 为引用键。
 */
export const TOOL_REFERENCE_REGEX_SOURCE = '({){2,}(@)([^@{}]+)(@)(}){2,}';

export const createToolReferenceRegExp = (flags = 'g') =>
  new RegExp(TOOL_REFERENCE_REGEX_SOURCE, flags);

/**
 * 折叠 PromptEditor 中多层包裹的工具引用花括号：`{{{{@id@}}}}` -> `{{@id@}}`。
 * 单层引用保持不变，避免把编辑器写入的合法格式改坏。
 */
export const normalizeToolReferenceBraces = (text: string): string => {
  if (typeof text !== 'string' || !text.includes('{')) return text;

  return text.replace(/\{{3,}@([^@{}]+)@\}{3,}/g, '{{@$1@}}');
};

/** 构造 plugin service 使用的团队隔离 source。 */
export const getTeamPluginSource = (teamId: string) => `${TeamPluginSourcePrefix}${teamId}`;

export function isTeamPluginSource(source?: string): source is string {
  return typeof source === 'string' && source.startsWith(TeamPluginSourcePrefix);
}

export function parseTeamPluginSource(source?: string): { teamId: string } | undefined {
  if (!isTeamPluginSource(source)) return;
  const teamMatch = /^teamId:([^:]+)$/.exec(source);
  if (teamMatch) {
    return {
      teamId: teamMatch[1]
    };
  }
}

export function isDebugToolSource(source?: string): source is string {
  return typeof source === 'string' && source.startsWith(DebugToolSourcePrefix);
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

export function hasDebugToolInSelectedTools(selectedTools?: SelectedToolItemType[] | null) {
  return selectedTools?.some((tool) => isDebugToolSource(tool.source)) ?? false;
}

/**
 * 检查发布数据中是否包含本地调试工具。
 * 需要同时覆盖普通工具节点、工具集配置和 Agent 节点 selectedTools 输入，避免调试 source 被发布到线上版本。
 */
export function hasDebugToolInNodes(nodes?: StoreNodeItemType[] | null) {
  return (
    nodes?.some((node) => {
      if (isDebugToolSource(node.source)) return true;

      const toolConfig = node.toolConfig;
      if (isDebugToolSource(toolConfig?.systemTool?.source)) return true;
      if (isDebugToolSource(toolConfig?.systemToolSet?.source)) return true;

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

/** 返回工具集子工具的有效描述；主动保存空字符串时保留空字符串。 */
export const getToolSetChildDescription = (
  savedDescription?: string | null | false | 0,
  definitionDescription = ''
) => (savedDescription === '' ? savedDescription : savedDescription || definitionDescription);

/**
 * 将当前节点保存的子工具描述合并到新模板配置。
 *
 * 系统工具集用 `toolId` 匹配，MCP/HTTP 工具集用 `name` 匹配；保留用户保存的描述，
 * 以便新增工具和历史缺失值继续使用新模板的工具定义描述。
 */
export const mergeToolSetChildDescriptions = ({
  savedToolConfig,
  templateToolConfig
}: {
  savedToolConfig?: NodeToolConfigType;
  templateToolConfig?: NodeToolConfigType;
}) => {
  if (!templateToolConfig) return templateToolConfig;

  const mergeToolList = <T extends { description: string }>({
    templateList,
    savedList,
    getKey
  }: {
    templateList: T[];
    savedList: T[] | undefined;
    getKey: (tool: T) => string;
  }) => {
    const savedDescriptionMap = new Map(savedList?.map((tool) => [getKey(tool), tool.description]));

    return templateList.map((tool) => {
      const description = getToolSetChildDescription(
        savedDescriptionMap.get(getKey(tool)),
        tool.description
      );
      return description === tool.description ? tool : { ...tool, description };
    });
  };

  return {
    ...templateToolConfig,
    ...(templateToolConfig.systemToolSet
      ? {
          systemToolSet: {
            ...templateToolConfig.systemToolSet,
            toolList: mergeToolList({
              templateList: templateToolConfig.systemToolSet.toolList,
              savedList: savedToolConfig?.systemToolSet?.toolList,
              getKey: (tool) => tool.toolId
            })
          }
        }
      : {}),
    ...(templateToolConfig.mcpToolSet
      ? {
          mcpToolSet: {
            ...templateToolConfig.mcpToolSet,
            toolList: mergeToolList({
              templateList: templateToolConfig.mcpToolSet.toolList ?? [],
              savedList: savedToolConfig?.mcpToolSet?.toolList,
              getKey: (tool) => tool.name
            })
          }
        }
      : {}),
    ...(templateToolConfig.httpToolSet
      ? {
          httpToolSet: {
            ...templateToolConfig.httpToolSet,
            toolList: mergeToolList({
              templateList: templateToolConfig.httpToolSet.toolList ?? [],
              savedList: savedToolConfig?.httpToolSet?.toolList,
              getKey: (tool) => tool.name
            })
          }
        }
      : {})
  } as NodeToolConfigType;
};

/** 内联 MCP/HTTP 子工具使用远端稳定标识生成模型 function name。 */
const getInlineToolSetChildIdentity = (
  tool: { name: string } | { method: string; path: string }
) => ('method' in tool ? `${tool.method.toUpperCase()}:${tool.path}` : `mcp:${tool.name}`);

export const getInlineToolSetChildNodeId = ({
  toolSetNodeId,
  tool
}: {
  toolSetNodeId: string;
  tool: { name: string } | { method: string; path: string };
}) => {
  return `t${hashStr(`${toolSetNodeId}:${getInlineToolSetChildIdentity(tool)}`).slice(0, 32)}`;
};
