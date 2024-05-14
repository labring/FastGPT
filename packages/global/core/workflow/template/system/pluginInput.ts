import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type';
import { getHandleConfig } from '../utils';

export const PluginInputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginInput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginInput,
  sourceHandle: getHandleConfig(false, true, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  unique: true,
  forbidDelete: true,
  avatar: '/imgs/workflow/input.png',
  name: '自定义插件输入',
  intro: '自定义配置外部输入，使用插件时，仅暴露自定义配置的输入',
  showStatus: false,
  version: '481',
  inputs: [],
  outputs: []
};
