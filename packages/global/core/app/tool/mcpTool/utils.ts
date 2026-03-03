import { NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../../../workflow/constants';
import { i18nT } from '../../../../../web/i18n/utils';
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
  avatar,
  toolId
}: {
  url: string;
  toolList: McpToolConfigType[];
  headerSecret?: StoreSecretValueType;
  name?: string;
  avatar?: string;
  toolId: string;
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
        url,
        toolId
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
  parentId
}: {
  tool: McpToolConfigType;
  avatar?: string;
  parentId: string;
}): RuntimeNodeItemType => {
  return {
    nodeId: getNanoid(),
    flowNodeType: FlowNodeTypeEnum.tool,
    avatar,
    intro: tool.description,
    toolConfig: {
      mcpTool: {
        toolId: `${AppToolSourceEnum.mcp}-${parentId}/${tool.name}`
      }
    },
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
    name: tool.name,
    version: ''
  };
};

/**
 * Get the parent id of the mcp toolset
 * mcp-123123/toolName ==> 123123
 * 123123/toolName ==> 123123
 * @param id mcp-parentId/name or parentId/name
 * @returns parentId
 */
export const getMCPParentId = (id: string) => id.split('-').pop()?.split('/')[0];
