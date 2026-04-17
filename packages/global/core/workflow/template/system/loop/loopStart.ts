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

export const LoopStartNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.nestedStart,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.nestedStart,
  showSourceHandle: true,
  showTargetHandle: false,
  avatar: 'core/workflow/template/loopStart',
  avatarLinear: 'core/workflow/template/loopStartLinear',
  colorSchema: 'violetDeep',
  name: i18nT('workflow:loop_start'),
  unique: true,
  forbidDelete: true,
  showStatus: false,
  inputs: [
    {
      key: NodeInputKeyEnum.nestedStartInput,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      required: true,
      value: ''
    },
    {
      key: NodeInputKeyEnum.nestedStartIndex,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.number,
      label: i18nT('workflow:Array_element_index')
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.nestedStartIndex,
      key: NodeOutputKeyEnum.nestedStartIndex,
      label: i18nT('workflow:Array_element_index'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.number
    }
  ]
};
