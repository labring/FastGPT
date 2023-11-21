import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';

export const RunPluginModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.pluginModule,
  flowType: FlowNodeTypeEnum.pluginModule,
  logo: '/imgs/module/custom.png',
  name: '自定义模块',
  showStatus: false,
  inputs: [],
  outputs: []
};
