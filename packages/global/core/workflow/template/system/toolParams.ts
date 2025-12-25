import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { i18nT } from '../../../../../web/i18n/utils';
import { NodeGradients } from '../../node/gradient';

export const ToolParamsNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.toolParams,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.toolParams,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/toolParams',
  avatarLinear: 'core/workflow/systemNode/toolParamsLinear',
  gradient: NodeGradients.indigo,
  name: i18nT('workflow:tool_custom_field'),
  intro: i18nT('workflow:intro_tool_params_config'),
  isTool: true,
  inputs: [],
  outputs: []
};
