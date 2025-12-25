import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';
import { Input_Template_DynamicInput } from '../../input';
import { Output_Template_AddOutput } from '../../output';
import { JS_TEMPLATE } from './constants';
import { i18nT } from '../../../../../../web/i18n/utils';

export const CodeNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.code,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.code,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/codeRun',
  avatarLinear: 'core/workflow/systemNode/codeRunLinear',
  colorSchema: 'lime',
  name: i18nT('workflow:code_execution'),
  intro: i18nT('workflow:execute_a_simple_script_code_usually_for_complex_data_processing'),
  showStatus: true,
  catchError: false,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/sandbox/',
  inputs: [
    {
      ...Input_Template_DynamicInput,
      description: i18nT('workflow:these_variables_will_be_input_parameters_for_code_execution'),
      customInputConfig: {
        selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
        showDescription: false,
        showDefaultValue: true
      }
    },
    {
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      canEdit: true,
      key: 'data1',
      label: 'data1',
      customInputConfig: {
        selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
        showDescription: false,
        showDefaultValue: true
      },
      required: true
    },
    {
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      canEdit: true,
      key: 'data2',
      label: 'data2',
      customInputConfig: {
        selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
        showDescription: false,
        showDefaultValue: true
      },
      required: true
    },
    {
      key: NodeInputKeyEnum.codeType,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: 'js'
    },
    {
      key: NodeInputKeyEnum.code,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: JS_TEMPLATE
    }
  ],
  outputs: [
    {
      ...Output_Template_AddOutput,
      description: i18nT('workflow:pass_returned_object_as_output_to_next_nodes')
    },
    {
      id: NodeOutputKeyEnum.rawResponse,
      key: NodeOutputKeyEnum.rawResponse,
      label: i18nT('workflow:full_response_data'),
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: 'qLUQfhG0ILRX',
      type: FlowNodeOutputTypeEnum.dynamic,
      key: 'result',
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'result'
    },
    {
      id: 'gR0mkQpJ4Og8',
      type: FlowNodeOutputTypeEnum.dynamic,
      key: 'data2',
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'data2'
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
