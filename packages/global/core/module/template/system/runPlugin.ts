import { ModuleTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';

export const RunPluginModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.pluginModule,
  templateType: ModuleTemplateTypeEnum.externalCall,
  flowType: FlowNodeTypeEnum.pluginModule,
  avatar: '/imgs/module/custom.png',
  intro: '',
  name: '自定义模块',
  showStatus: false,
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
