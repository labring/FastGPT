import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import type { FlowNodeTemplateType } from '../../type/node';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../constants';
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';

export const McpCallModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.mcpCall,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.mcpCall,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/mcpCall',
  name: i18nT('workflow:mcp_call'),
  intro: i18nT('workflow:intro_mcp_call'),
  showStatus: false,
  isTool: false,
  version: '481',
  inputs: [
    {
      key: NodeInputKeyEnum.mcpUrl,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('common:core.module.input.label.MCP Url'),
      description: i18nT('common:core.module.input.description.MCP Url'),
      placeholder: i18nT('common:core.module.input.description.MCP Url'),
      required: true
    },
    {
      key: NodeInputKeyEnum.mcpAuth,
      renderTypeList: [FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('common:core.module.input.label.MCP Auth'),
      description: i18nT('common:core.module.input.description.MCP Auth'),
      required: false
    },
    {
      key: NodeInputKeyEnum.mcpTool,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('common:core.module.input.label.MCP Url'),
      required: true
    },
    {
      key: NodeInputKeyEnum.mcpParams,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: '',
      required: false
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.contextExtractFields,
      key: NodeOutputKeyEnum.contextExtractFields,
      label: i18nT('common:core.module.output.label.MCP call result'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
