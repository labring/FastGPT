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
import { Output_Template_Finish, Output_Template_AddOutput } from '../output';

export const lafModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.lafModule,
  templateType: FlowNodeTemplateTypeEnum.externalCall,
  flowType: FlowNodeTypeEnum.lafModule,
  avatar: '/imgs/module/laf.png',
  name: 'Laf 函数调用（测试）',
  intro: '可以调用Laf账号下的云函数。',
  showStatus: true,
  isTool: true,
  inputs: [
    Input_Template_Switch,
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
      label: '原始响应',
      description: 'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
      valueType: ModuleIOValueTypeEnum.any,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    {
      ...Output_Template_AddOutput,
      editField: {
        key: true,
        description: true,
        dataType: true,
        defaultValue: true
      },
      defaultEditField: {
        label: '',
        key: '',
        description: '',
        outputType: FlowNodeOutputTypeEnum.source,
        valueType: ModuleIOValueTypeEnum.string
      }
    },
    Output_Template_Finish
  ]
};
