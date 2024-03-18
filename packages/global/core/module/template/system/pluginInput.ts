import {
  FlowNodeTemplateTypeEnum,
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum
} from '../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type.d';

export const PluginInputModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.pluginInput,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowType: FlowNodeTypeEnum.pluginInput,
  avatar: '/imgs/module/input.png',
  name: '定义插件输入',
  intro: '自定义配置外部输入，使用插件时，仅暴露自定义配置的输入',
  showStatus: false,
  inputs: [
    {
      key: ModuleInputKeyEnum.pluginStart,
      type: FlowNodeInputTypeEnum.hidden,
      valueType: ModuleIOValueTypeEnum.boolean,
      label: '插件开始运行',
      description:
        '插件开始运行时，会输出一个 True 的标识。有时候，插件不会有额外的的输入，为了顺利的进入下一个阶段，你可以将该值连接到下一个节点的触发器中。',
      showTargetInApp: true,
      showTargetInPlugin: true
    }
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.pluginStart,
      label: '插件开始运行',
      type: FlowNodeOutputTypeEnum.source,
      valueType: ModuleIOValueTypeEnum.boolean,
      targets: []
    }
  ]
};
