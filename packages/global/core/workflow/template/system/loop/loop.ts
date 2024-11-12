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
import {
  Input_Template_Children_Node_List,
  Input_Template_LOOP_NODE_OFFSET,
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '../../input';

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
  courseUrl: '/docs/guide/workbench/workflow/loop/',
  inputs: [
    {
      key: NodeInputKeyEnum.loopInputArray,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayAny,
      required: true,
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
      id: NodeOutputKeyEnum.loopArray,
      key: NodeOutputKeyEnum.loopArray,
      label: i18nT('workflow:loop_result'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayAny
    }
  ]
};
