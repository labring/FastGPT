import { NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../../../workflow/constants';
import { i18nT } from '../../../../common/i18n/utils';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../../workflow/node/constant';
import { type McpToolConfigType } from '../../tool/mcpTool/type';
import { type RuntimeNodeItemType } from '../../../workflow/runtime/type';
import { type StoreSecretValueType } from '../../../../common/secret/type';
import { jsonSchema2NodeInput } from '../../jsonschema';
import { getNanoid } from '../../../../common/string/tools';
import { AppToolSourceEnum } from '../constants';

export const getMCPToolSetRuntimeNode = ({
  url,
  toolList,
  headerSecret,
  name,
  avatar
}: {
  url: string;
  toolList: McpToolConfigType[];
  headerSecret?: StoreSecretValueType;
  name?: string;
  avatar?: string;
}): RuntimeNodeItemType => {
  return {
    nodeId: getNanoid(16),
    flowNodeType: FlowNodeTypeEnum.toolSet,
    avatar,
    intro: 'MCP Tools',
    toolConfig: {
      mcpToolSet: {
        toolList,
        headerSecret,
        url
      }
    },
    inputs: [],
    outputs: [],
    name: name || '',
    version: ''
  };
};

/** 按外部资源引用或节点内配置构造 MCP runtime 子工具，IO 始终取自工具 Schema。 */
export const getMCPToolRuntimeNode = (
  params: {
    nodeId: string;
    tool: McpToolConfigType;
    toolsetName: string;
    avatar?: string;
  } & (
    | { toolSetId: string; url?: never; headerSecret?: never }
    | { toolSetId?: never; url: string; headerSecret?: StoreSecretValueType }
  )
): RuntimeNodeItemType => {
  const { tool, avatar = 'core/app/type/mcpToolsFill', nodeId, toolsetName } = params;
  const inputs = jsonSchema2NodeInput({ jsonSchema: tool.inputSchema, schemaType: 'mcp' }).map(
    (input) => ({
      ...input,
      // MCP schema 没有 FastGPT 的手动配置上下文，子工具参数默认交给 Agent 生成。
      defaultToAgentGenerated: input.defaultToAgentGenerated ?? true
    })
  );

  return {
    nodeId,
    flowNodeType: FlowNodeTypeEnum.tool,
    avatar,
    intro: tool.description,
    toolConfig: {
      mcpTool:
        params.toolSetId !== undefined
          ? {
              toolId: `${AppToolSourceEnum.mcp}-${params.toolSetId}/${tool.name}`
            }
          : {
              ...tool,
              url: params.url,
              ...(params.headerSecret ? { headerSecret: params.headerSecret } : {})
            }
    },
    jsonSchema: tool.inputSchema,
    inputs,
    outputs: [
      {
        id: NodeOutputKeyEnum.rawResponse,
        key: NodeOutputKeyEnum.rawResponse,
        required: true,
        label: i18nT('workflow:raw_response'),
        description: i18nT('workflow:tool_raw_response_description'),
        valueType: WorkflowIOValueTypeEnum.any,
        type: FlowNodeOutputTypeEnum.static
      }
    ],
    name: `${toolsetName}/${tool.name}`,
    version: ''
  };
};

export const parsetMcpToolConfig = (config: {
  toolId: string;
}):
  | {
      toolsetId: string;
      toolName: string;
    }
  | undefined => {
  const prefix = `${AppToolSourceEnum.mcp}-`;
  if (!config.toolId.startsWith(prefix)) return undefined;
  const [toolsetId, ...rest] = config.toolId.slice(prefix.length).split('/');
  const toolName = rest.join('/');
  if (!toolsetId || !toolName) return undefined;
  return {
    toolsetId,
    toolName
  };
};
