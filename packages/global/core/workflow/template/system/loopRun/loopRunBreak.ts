import { FlowNodeTypeEnum } from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../../constants';
import { i18nT } from '../../../../../../web/i18n/utils';

export const LoopRunBreakNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopRunBreak,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.loopRunBreak,
  showSourceHandle: false,
  showTargetHandle: true,
  avatar: 'core/workflow/template/loopRunBreak',
  avatarLinear: 'core/workflow/template/loopRunBreakLinear',
  colorSchema: 'loopRun',
  name: i18nT('workflow:loop_run_break'),
  intro: i18nT('workflow:loop_run_break_tip'),
  showStatus: false,
  inputs: [],
  outputs: []
};
