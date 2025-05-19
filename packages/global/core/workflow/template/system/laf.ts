import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { Input_Template_DynamicInput } from '../input';
import { Output_Template_AddOutput } from '../output';
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';

export const nodeLafCustomInputConfig = {
  selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
  showDescription: false,
  showDefaultValue: true
};

export const LafModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.lafModule,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.lafModule,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/lafDispatch',
  name: i18nT('workflow:laf_function_call_test'),
  intro: i18nT('workflow:intro_laf_function_call'),
  showStatus: true,
  isTool: true,
  courseUrl: '/docs/guide/workbench/workflow/laf/',
  version: '481',
  inputs: [
    {
      ...Input_Template_DynamicInput,
      description: i18nT('workflow:dynamic_input_description'),
      customInputConfig: nodeLafCustomInputConfig
    },
    {
      key: NodeInputKeyEnum.httpReqUrl,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '',
      description: 'core.module.input.description.Http Request Url',
      placeholder: 'https://api.ai.com/getInventory',
      required: false
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.httpRawResponse,
      key: NodeOutputKeyEnum.httpRawResponse,
      label: i18nT('workflow:raw_response'),
      description: i18nT('workflow:http_raw_response_description'),
      valueType: WorkflowIOValueTypeEnum.any,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      ...Output_Template_AddOutput
    }
  ]
};
