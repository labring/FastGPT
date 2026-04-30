import { NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../../../workflow/constants';
import { i18nT } from '../../../../../web/i18n/utils';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../../workflow/node/constant';
import { type McpToolConfigType } from '../../tool/mcpTool/type';
import { type RuntimeNodeItemType } from '../../../workflow/runtime/type';
import { type StoreSecretValueType } from '../../../../common/secret/type';
import { jsonSchema2NodeInput } from '../../jsonschema';
import { getNanoid } from '../../../../common/string/tools';
import { AppToolSourceEnum } from '../constants';
import type { NodeToolConfigType } from '../../../workflow/type/node';

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

export const getMCPToolRuntimeNode = ({
  tool,
  avatar = 'core/app/type/mcpToolsFill',
  nodeId,
  toolsetName,
  toolSetId
}: {
  nodeId: string;
  tool: McpToolConfigType;
  toolSetId: string;
  toolsetName: string;
  avatar?: string;
}): RuntimeNodeItemType => {
  return {
    nodeId,
    flowNodeType: FlowNodeTypeEnum.tool,
    avatar,
    intro: tool.description,
    toolConfig: {
      mcpTool: {
        toolId: `${AppToolSourceEnum.mcp}-${toolSetId}/${tool.name}` // When runtool is used, parentId and toolname will be employed
      }
    },
    jsonSchema: tool.inputSchema,
    inputs: jsonSchema2NodeInput({ jsonSchema: tool.inputSchema, schemaType: 'mcp' }),
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

export const parsetMcpToolConfig = (
  config: NonNullable<NodeToolConfigType['mcpTool']>
):
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
