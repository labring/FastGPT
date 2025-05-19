import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node.d';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { getHandleConfig } from '../../utils';
import { i18nT } from '../../../../../../web/i18n/utils';

export const LoopStartNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopStart,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.loopStart,
  sourceHandle: getHandleConfig(false, true, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  avatar: 'core/workflow/template/loopStart',
  name: i18nT('workflow:loop_start'),
  unique: true,
  forbidDelete: true,
  showStatus: false,
  version: '4811',
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
