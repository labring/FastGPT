import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import {
  Input_Template_DynamicInput,
  Input_Template_Switch,
  Input_Template_AddInputParam
} from '../input';
import { Output_Template_Finish } from '../output';

export const lafModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.lafModule,
  templateType: FlowNodeTemplateTypeEnum.externalCall,
  flowType: FlowNodeTypeEnum.lafModule,
  avatar: '/imgs/module/laf.png',
  name: 'laf 函数调用',
  intro: '可以请求 laf 函数，实现更为复杂的操作（联网搜索、数据库查询等）',
  showStatus: true,
  isTool: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.httpMethod,
      type: FlowNodeInputTypeEnum.custom,
      valueType: ModuleIOValueTypeEnum.string,
      label: '',
      value: 'POST',
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.httpReqUrl,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleIOValueTypeEnum.string,
      label: '',
      description: 'core.module.input.description.Http Request Url',
      placeholder: 'https://api.ai.com/getInventory',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.httpHeaders,
      type: FlowNodeInputTypeEnum.custom,
      valueType: ModuleIOValueTypeEnum.any,
      value: [],
      label: '',
      description: 'core.module.input.description.Http Request Header',
      placeholder: 'core.module.input.description.Http Request Header',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.httpParams,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleIOValueTypeEnum.any,
      value: [],
      label: '',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.httpJsonBody,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleIOValueTypeEnum.any,
      value: '',
      label: '',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    Input_Template_DynamicInput,
    {
      ...Input_Template_AddInputParam,
      editField: {
        key: true,
        description: true,
        dataType: true
      },
      defaultEditField: {
        label: '',
        key: '',
        description: '',
        inputType: FlowNodeInputTypeEnum.target,
        valueType: ModuleIOValueTypeEnum.string
      }
    }
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.httpRawResponse,
      label: 'result',
      description: 'laf 函数请求的原始响应。只能接受字符串或JSON类型响应数据。',
      valueType: ModuleIOValueTypeEnum.any,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    Output_Template_Finish
  ]
};
