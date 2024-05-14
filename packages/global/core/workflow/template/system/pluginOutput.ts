import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type';
import { getHandleConfig } from '../utils';

export const PluginOutputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginOutput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginOutput,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, true),
  unique: true,
  forbidDelete: true,
  avatar: '/imgs/workflow/output.png',
  name: '自定义插件输出',
  intro: '自定义配置外部输出，使用插件时，仅暴露自定义配置的输出',
  showStatus: false,
  version: '481',
  inputs: [],
  outputs: []
};
