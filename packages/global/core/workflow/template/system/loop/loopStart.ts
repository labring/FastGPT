import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node.d';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { i18nT } from '../../../../../../web/i18n/utils';

export const LoopStartNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopStart,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.loopStart,
  showSourceHandle: true,
  showTargetHandle: false,
  avatar: 'core/workflow/systemNode/loopStart',
  avatarLinear: 'core/workflow/systemNode/loopStartLinear',
  colorSchema: 'violetDeep',
  name: i18nT('workflow:loop_start'),
  unique: true,
  forbidDelete: true,
  showStatus: false,
  inputs: [
    {
      key: NodeInputKeyEnum.loopStartInput,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      required: true,
      value: ''
    },
    {
      key: NodeInputKeyEnum.loopStartIndex,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.number,
      label: i18nT('workflow:Array_element_index')
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.loopStartIndex,
      key: NodeOutputKeyEnum.loopStartIndex,
      label: i18nT('workflow:Array_element_index'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.number
    }
  ]
};
