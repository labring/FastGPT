import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../../node/constant';
import { type FlowNodeTemplateType } from '../../../../type/node';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../../constants';
import { i18nT } from '../../../../../../../web/i18n/utils';
import {
  Input_Template_Children_Node_List,
  Input_Template_NESTED_NODE_OFFSET,
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '../../../input';
import { PluginStatusEnum } from '../../../../../plugin/type';

export const LoopNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loop,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.loop,
  status: PluginStatusEnum.SoonOffline,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/loop',
  avatarLinear: 'core/workflow/template/loopLinear',
  colorSchema: 'violetDeep',
  name: i18nT('workflow:loop'),
  intro: i18nT('workflow:intro_loop'),
  showStatus: true,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/loop/',
  inputs: [
    {
      key: NodeInputKeyEnum.nestedInputArray,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayAny,
      required: true,
      label: i18nT('workflow:loop_input_array'),
      value: []
    },
    Input_Template_Children_Node_List,
    Input_Template_Node_Width,
    Input_Template_Node_Height,
    Input_Template_NESTED_NODE_OFFSET
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.nestedArrayResult,
      key: NodeOutputKeyEnum.nestedArrayResult,
      label: i18nT('workflow:loop_result'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayAny
    }
  ]
};
