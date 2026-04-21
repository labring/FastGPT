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

export const LoopRunStartNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.loopRunStart,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.loopRunStart,
  showSourceHandle: true,
  showTargetHandle: false,
  avatar: 'core/workflow/template/loopRunStart',
  avatarLinear: 'core/workflow/template/loopRunStartLinear',
  colorSchema: 'loopRun',
  name: i18nT('workflow:loop_run_start'),
  unique: true,
  forbidDelete: true,
  showStatus: false,
  inputs: [
    {
      key: NodeInputKeyEnum.loopRunMode,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '',
      value: 'array'
    },
    {
      key: NodeInputKeyEnum.nestedStartInput,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: ''
    },
    {
      key: NodeInputKeyEnum.nestedStartIndex,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.number,
      label: ''
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.currentIndex,
      key: NodeOutputKeyEnum.currentIndex,
      label: i18nT('workflow:current_index'),
      description: i18nT('workflow:current_index_desc'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      id: NodeOutputKeyEnum.currentItem,
      key: NodeOutputKeyEnum.currentItem,
      label: i18nT('workflow:current_item'),
      description: i18nT('workflow:current_item_desc'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.any
    },
    {
      id: NodeOutputKeyEnum.currentIteration,
      key: NodeOutputKeyEnum.currentIteration,
      label: i18nT('workflow:current_iteration'),
      description: i18nT('workflow:current_iteration_desc'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.number
    }
  ]
};
