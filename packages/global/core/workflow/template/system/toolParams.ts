import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';

export const ToolParamsNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.toolParams,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.toolParams,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/toolParams',
  name: i18nT('workflow:tool_custom_field'),
  intro: i18nT('workflow:intro_tool_params_config'),
  version: '4811',
  isTool: true,
  inputs: [],
  outputs: []
};
