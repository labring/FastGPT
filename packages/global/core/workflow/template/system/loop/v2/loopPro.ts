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
  Input_Template_LOOP_NODE_OFFSET,
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '../../../input';
import { Output_Template_AddOutput } from '../../../output';

export const LoopProNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopPro,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.loopPro,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/loopPro',
  avatarLinear: 'core/workflow/template/loopProLinear',
  colorSchema: 'workflowLoop',
  name: i18nT('workflow:loop_pro'),
  intro: i18nT('workflow:intro_loop_pro'),
  showStatus: true,
  catchError: false,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/looppro/',
  inputs: [
    {
      key: NodeInputKeyEnum.loopProMode,
      renderTypeList: [FlowNodeInputTypeEnum.select],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:loop_pro_mode'),
      value: 'array',
      list: [
        { label: i18nT('workflow:loop_pro_mode_array'), value: 'array' },
        { label: i18nT('workflow:loop_pro_mode_condition'), value: 'condition' }
      ]
    },
    {
      key: NodeInputKeyEnum.loopInputArray,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayAny,
      required: false,
      label: i18nT('workflow:loop_input_array'),
      value: []
    },
    Input_Template_Children_Node_List,
    Input_Template_Node_Width,
    Input_Template_Node_Height,
    Input_Template_LOOP_NODE_OFFSET
  ],
  outputs: [
    {
      ...Output_Template_AddOutput,
      description: i18nT('workflow:loop_pro_custom_output_desc')
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: i18nT('workflow:error_text'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.error
    }
  ]
};
