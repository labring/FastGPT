import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import { FlowNodeTemplateTypeEnum, NodeOutputKeyEnum } from '../../constants';
import { createShowInContext } from '../context';
import { i18nT } from '../../../../common/i18n/utils';

export const ToolParamsNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.toolParams,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.toolParams,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/toolParams',
  avatarLinear: 'core/workflow/template/toolParamsLinear',
  colorSchema: 'indigo',
  name: i18nT('workflow:tool_custom_field'),
  intro: i18nT('workflow:intro_tool_params_config'),
  isTool: true,
  isShowInContext: (ctx) =>
    !!ctx &&
    (ctx.isSidebar
      ? ctx.hasToolNode
      : createShowInContext([
          { sourceType: FlowNodeTypeEnum.toolCall, handleId: NodeOutputKeyEnum.selectedTools }
        ])(ctx)),
  inputs: [],
  outputs: []
};
