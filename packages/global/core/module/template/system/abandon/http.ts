import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowModuleTemplateType } from '../../../type';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleTemplateTypeEnum
} from '../../../constants';
import {
  Input_Template_AddInputParam,
  Input_Template_DynamicInput,
  Input_Template_Switch
} from '../../input';
import { Output_Template_AddOutput, Output_Template_Finish } from '../../output';

export const HttpModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.httpRequest,
  templateType: ModuleTemplateTypeEnum.externalCall,
  flowType: FlowNodeTypeEnum.httpRequest,
  avatar: '/imgs/module/http.png',
  name: 'core.module.template.Http request',
  intro:
    '该Http模块已被弃用，将于2024/3/31 不再提供服务。请尽快删除该模块并重新添加新的 Http 模块。',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.httpMethod,
      type: FlowNodeInputTypeEnum.select,
      valueType: ModuleIOValueTypeEnum.string,
      label: 'core.module.input.label.Http Request Method',
      value: 'POST',
      list: [
        {
          label: 'GET',
          value: 'GET'
        },
        {
          label: 'POST',
          value: 'POST'
        }
      ],
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.httpReqUrl,
      type: FlowNodeInputTypeEnum.input,
      valueType: ModuleIOValueTypeEnum.string,
      label: 'core.module.input.label.Http Request Url',
      description: 'core.module.input.description.Http Request Url',
      placeholder: 'https://api.ai.com/getInventory',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.httpHeaders,
      type: FlowNodeInputTypeEnum.JSONEditor,
      valueType: ModuleIOValueTypeEnum.string,
      value: '',
      label: 'core.module.input.label.Http Request Header',
      description: 'core.module.input.description.Http Request Header',
      placeholder: 'core.module.input.description.Http Request Header',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    Input_Template_DynamicInput,
    {
      ...Input_Template_AddInputParam,
      editField: {
        key: true,
        name: true,
        description: true,
        required: true,
        dataType: true
      },
      defaultEditField: {
        label: '',
        key: '',
        description: '',
        inputType: FlowNodeInputTypeEnum.target,
        valueType: ModuleIOValueTypeEnum.string,
        required: true
      }
    }
  ],
  outputs: [
    Output_Template_Finish,
    {
      ...Output_Template_AddOutput,
      editField: {
        key: true,
        name: true,
        description: true,
        dataType: true
      },
      defaultEditField: {
        label: '',
        key: '',
        description: '',
        outputType: FlowNodeOutputTypeEnum.source,
        valueType: ModuleIOValueTypeEnum.string
      }
    }
  ]
};
