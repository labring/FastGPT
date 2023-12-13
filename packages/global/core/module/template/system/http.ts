import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type';
import { ModuleDataTypeEnum, ModuleInputKeyEnum, ModuleTemplateTypeEnum } from '../../constants';
import { Input_Template_TFSwitch } from '../input';
import { Output_Template_Finish } from '../output';

export const HttpModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.httpRequest,
  templateType: ModuleTemplateTypeEnum.externalCall,
  flowType: FlowNodeTypeEnum.httpRequest,
  avatar: '/imgs/module/http.png',
  name: 'HTTP模块',
  intro: '可以发出一个 HTTP POST 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
  showStatus: true,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: ModuleInputKeyEnum.httpMethod,
      type: FlowNodeInputTypeEnum.select,
      valueType: ModuleDataTypeEnum.string,
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
      valueType: ModuleDataTypeEnum.string,
      label: 'core.module.input.label.Http Request Url',
      description: 'core.module.input.description.Http Request Url',
      placeholder: 'https://api.ai.com/getInventory',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.httpHeader,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleDataTypeEnum.string,
      label: 'core.module.input.label.Http Request Header',
      description: 'core.module.input.description.Http Request Header',
      placeholder: 'core.module.input.description.Http Request Header',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: [Output_Template_Finish]
};
