import { FlowNodeTypeEnum } from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../../constants';
import { i18nT } from '../../../../../common/i18n/utils';

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
  isShowInContext: (ctx) =>
    !!ctx &&
    (ctx.isSidebar
      ? // 侧边栏拖入容器时带有目标容器（parentType），按目标容器判断；纯侧边栏列表无目标容器，退回画布是否有循环节点
        ctx.parentType
        ? ctx.parentType === FlowNodeTypeEnum.loopRun
        : ctx.hasLoopRunNode
      : ctx.parentType === FlowNodeTypeEnum.loopRun),
  inputs: [],
  outputs: []
};
