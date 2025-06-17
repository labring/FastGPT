import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../workflow/node/constant';
import { type McpToolConfigType } from '../type';
import { i18nT } from '../../../../web/i18n/utils';
import { type RuntimeNodeItemType } from '../../workflow/runtime/type';
import { type StoreSecretValueType } from '../../../common/secret/type';
import { jsonSchema2NodeInput } from '../jsonschema';
import { getNanoid } from '../../../common/string/tools';

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
    inputs: [
      {
        key: NodeInputKeyEnum.toolSetData,
        label: 'Tool Set Data',
        valueType: WorkflowIOValueTypeEnum.object,
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        value: {
          url,
          headerSecret,
          toolList
        }
      }
    ],
    outputs: [],
    name: name || '',
    version: ''
  };
};

export const getMCPToolRuntimeNode = ({
  tool,
  url,
  headerSecret,
  avatar = 'core/app/type/mcpToolsFill'
}: {
  tool: McpToolConfigType;
  url: string;
  headerSecret?: StoreSecretValueType;
  avatar?: string;
}): RuntimeNodeItemType => {
  return {
    nodeId: getNanoid(16),
    flowNodeType: FlowNodeTypeEnum.tool,
    avatar,
    intro: tool.description,
    inputs: [
      {
        key: NodeInputKeyEnum.toolData,
        label: 'Tool Data',
        valueType: WorkflowIOValueTypeEnum.object,
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        value: {
          ...tool,
          url,
          headerSecret
        }
      },
      ...jsonSchema2NodeInput(tool.inputSchema)
    ],
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
