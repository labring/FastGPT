import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { getHandleConfig } from '../../utils';
import { i18nT } from '../../../../../../web/i18n/utils';

export const LoopNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loop,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.loop,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/loop',
  name: i18nT('workflow:loop'),
  intro: i18nT('workflow:intro_loop'),
  showStatus: true,
  version: '4811',
  inputs: [
    {
      key: NodeInputKeyEnum.loopInputArray,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayAny,
      required: true,
      label: i18nT('workflow:loop_input_array'),
      value: []
    },
    {
      key: NodeInputKeyEnum.loopFlow,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: {
        width: 0,
        height: 0,
        childNodes: []
      }
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.loopArray,
      key: NodeOutputKeyEnum.loopArray,
      label: i18nT('workflow:loop_result'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayAny
    }
  ]
};
