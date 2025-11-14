import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { i18nT } from '../../../../../web/i18n/utils';

export const StopToolNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.stopTool,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.stopTool,
  showSourceHandle: false,
  showTargetHandle: true,
  avatar: 'core/workflow/template/stopTool',
  name: i18nT('workflow:tool_call_termination'),
  intro: i18nT('workflow:intro_tool_call_termination'),
  inputs: [],
  outputs: []
};
