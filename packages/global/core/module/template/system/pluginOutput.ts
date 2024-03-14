import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type.d';

export const PluginOutputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginOutput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowType: FlowNodeTypeEnum.pluginOutput,
  avatar: '/imgs/module/output.png',
  name: '定义插件输出',
  intro: '自定义配置外部输出，使用插件时，仅暴露自定义配置的输出',
  showStatus: false,
  inputs: [],
  outputs: []
};
