import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type';
import {
  DYNAMIC_INPUT_KEY,
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleTemplateTypeEnum
} from '../../constants';
import {
  Input_Template_AddInputParam,
  Input_Template_DynamicInput,
  Input_Template_Switch
} from '../input';
import { Output_Template_AddOutput, Output_Template_Finish } from '../output';

export const HttpModule468: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.httpRequest468,
  templateType: ModuleTemplateTypeEnum.externalCall,
  flowType: FlowNodeTypeEnum.httpRequest468,
  avatar: '/imgs/module/http.png',
  name: 'core.module.template.Http request',
  intro: 'core.module.template.Http request intro',
  showStatus: true,
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
