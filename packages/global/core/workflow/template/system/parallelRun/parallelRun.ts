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

export const ParallelRunNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.parallelRun,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.parallelRun,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/parallelRun',
  avatarLinear: 'core/workflow/template/parallelRunLinear',
  colorSchema: 'violetDeep',
  name: i18nT('workflow:parallel_run'),
  intro: i18nT('workflow:intro_parallel_run'),
  showStatus: true,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/parallel_run/',
  inputs: [
    {
      key: NodeInputKeyEnum.nestedInputArray,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayAny,
      required: true,
      label: i18nT('workflow:loop_input_array'),
      value: []
    },
    {
      key: NodeInputKeyEnum.parallelRunMaxConcurrency,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      required: true,
      label: i18nT('workflow:parallel_run_max_concurrency'),
      description: i18nT('workflow:parallel_run_max_concurrency_tip'),
      min: 1,
      value: 5
    },
    {
      key: NodeInputKeyEnum.parallelRunMaxRetryTimes,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      required: true,
      label: i18nT('workflow:parallel_run_max_retry_times'),
      description: i18nT('workflow:parallel_run_max_retry_times_tip'),
      min: 0,
      max: 5,
      value: 3
    },
    Input_Template_Children_Node_List,
    Input_Template_Node_Width,
    Input_Template_Node_Height,
    Input_Template_NESTED_NODE_OFFSET
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.parallelSuccessResults,
      key: NodeOutputKeyEnum.parallelSuccessResults,
      label: i18nT('workflow:parallel_success_results'),
      description: i18nT('workflow:parallel_success_results_desc'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayAny
    },
    {
      id: NodeOutputKeyEnum.parallelFullResults,
      key: NodeOutputKeyEnum.parallelFullResults,
      label: i18nT('workflow:parallel_full_results'),
      description: i18nT('workflow:parallel_full_results_desc'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.arrayObject
    },
    {
      id: NodeOutputKeyEnum.parallelStatus,
      key: NodeOutputKeyEnum.parallelStatus,
      label: i18nT('workflow:parallel_status'),
      description: i18nT('workflow:parallel_status_desc'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
