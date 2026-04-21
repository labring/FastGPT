import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { i18nT } from '../../../../../../web/i18n/utils';
import {
  Input_Template_Children_Node_List,
  Input_Template_NESTED_NODE_OFFSET,
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '../../input';

export enum LoopRunModeEnum {
  array = 'array',
  conditional = 'conditional'
}

export const LoopRunNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopRun,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.loopRun,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/loopRun',
  avatarLinear: 'core/workflow/template/loopRunLinear',
  colorSchema: 'loopRun',
  name: i18nT('workflow:loop_run'),
  intro: i18nT('workflow:intro_loop_run'),
  showStatus: true,
  catchError: false,
  inputs: [
    {
      key: NodeInputKeyEnum.loopRunMode,
      renderTypeList: [FlowNodeInputTypeEnum.select],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:loop_run_mode'),
      description: i18nT('workflow:loop_run_mode_tip'),
      list: [
        {
          label: i18nT('workflow:loop_run_mode_array'),
          value: LoopRunModeEnum.array,
          icon: 'core/workflow/inputType/array',
          description: i18nT('workflow:loop_run_mode_array_desc')
        },
        {
          label: i18nT('workflow:loop_run_mode_conditional'),
          value: LoopRunModeEnum.conditional,
          icon: 'core/workflow/inputType/conditional',
          description: i18nT('workflow:loop_run_mode_conditional_desc')
        }
      ],
      value: LoopRunModeEnum.array
    },
    {
      key: NodeInputKeyEnum.loopRunInputArray,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayAny,
      required: true,
      label: i18nT('workflow:loop_run_input_array'),
      value: []
    },
    {
      key: NodeInputKeyEnum.loopCustomOutputs,
      renderTypeList: [FlowNodeInputTypeEnum.addInputParam],
      valueType: WorkflowIOValueTypeEnum.dynamic,
      label: i18nT('workflow:loop_custom_outputs'),
      description: i18nT('workflow:loop_custom_outputs_tip'),
      required: false,
      customInputConfig: {
        selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
        showDescription: false,
        showDefaultValue: false,
        hideBottomDivider: true
      }
    },
    Input_Template_Children_Node_List,
    Input_Template_Node_Width,
    Input_Template_Node_Height,
    Input_Template_NESTED_NODE_OFFSET
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.errorText,
      key: NodeOutputKeyEnum.errorText,
      label: i18nT('workflow:error_text'),
      type: FlowNodeOutputTypeEnum.error,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
