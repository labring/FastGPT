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
      key: ModuleInputKeyEnum.httpReqUrl,
      type: FlowNodeInputTypeEnum.input,
      valueType: ModuleDataTypeEnum.string,
      label: 'HTTP请求地址',
      description:
        '新的HTTP请求地址。如果出现两个“请求地址”，可以删除该模块重新加入，会拉取最新的模块配置。',
      placeholder: 'https://api.ai.com/getInventory',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.httpReqAuth,
      type: FlowNodeInputTypeEnum.input,
      valueType: ModuleDataTypeEnum.string,
      label: '安全校验凭证',
      description: '会在 Header 中添加 Authorization 字段',
      placeholder: 'Bearer xxx',
      required: false,
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: [Output_Template_Finish]
};
