import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type.d';

export const PluginInputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginInput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowType: FlowNodeTypeEnum.pluginInput,
  avatar: '/imgs/module/input.png',
  name: '定义插件输入',
  intro: '自定义配置外部输入，使用插件时，仅暴露自定义配置的输入',
  showStatus: false,
  inputs: [],
  outputs: []
};
