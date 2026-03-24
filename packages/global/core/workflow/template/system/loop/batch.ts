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
  Input_Template_LOOP_NODE_OFFSET,
  Input_Template_Node_Height,
  Input_Template_Node_Width
} from '../../input';

export const BatchNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.batch,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.batch,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/loop',
  avatarLinear: 'core/workflow/template/loopLinear',
  colorSchema: 'violetDeep',
  name: i18nT('workflow:batch'),
  intro: i18nT('workflow:intro_batch'),
  showStatus: true,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/batch/',
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
      key: NodeInputKeyEnum.batchParallelConcurrency,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 0,
      valueType: WorkflowIOValueTypeEnum.number,
      required: true,
      label: i18nT('workflow:batch_parallel_concurrency'),
      min: 1,
      max: 10,
      value: 5
    },
    {
      key: NodeInputKeyEnum.batchParallelRetryTimes,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      required: true,
      label: i18nT('workflow:batch_parallel_retry_times'),
      min: 0,
      max: 5,
      value: 3
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
      label: i18nT('workflow:batch_result_success'),
      description: i18nT('workflow:batch_result_success_tip'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayAny
    },
    {
      id: NodeOutputKeyEnum.batchRawResult,
      key: NodeOutputKeyEnum.batchRawResult,
      label: i18nT('workflow:batch_result_raw'),
      description: i18nT('workflow:batch_result_raw_tip'),
      required: true,
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayObject
    },
    {
      id: NodeOutputKeyEnum.batchStatus,
      key: NodeOutputKeyEnum.batchStatus,
      label: i18nT('workflow:batch_status'),
      description: i18nT('workflow:batch_status_tip'),
      required: true,
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
