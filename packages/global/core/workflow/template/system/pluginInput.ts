import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node';
import { getHandleConfig } from '../utils';

export const PluginInputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginInput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.pluginInput,
  sourceHandle: getHandleConfig(false, true, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  unique: true,
  forbidDelete: true,
  avatar: 'core/workflow/template/workflowStart',
  name: '插件输入',
  intro: '可以配置插件需要哪些输入，利用这些输入来运行插件',
  showStatus: false,
  version: '481',
  inputs: [],
  outputs: []
};
