import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';

export const StopToolNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.stopTool,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.stopTool,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/stopTool',
  name: i18nT('workflow:tool_call_termination'),
  intro: i18nT('workflow:intro_tool_call_termination'),
  version: '481',
  inputs: [],
  outputs: []
};
