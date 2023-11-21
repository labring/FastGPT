import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from './node/constant';
import { ModuleInputKeyEnum } from './constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';
import { ModuleItemType } from './type';

export function getPluginTemplatePluginIdInput(pluginId: string) {
  return {
    key: ModuleInputKeyEnum.pluginId,
    type: FlowNodeInputTypeEnum.hidden,
    label: 'pluginId',
    value: pluginId,
    connected: true
  };
}

export function formatPluginIOModules(
  pluginId: string,
  modules: ModuleItemType[]
): {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
} {
  const pluginInput = modules.find((module) => module.flowType === FlowNodeTypeEnum.pluginInput);
  const customOutput = modules.find((module) => module.flowType === FlowNodeTypeEnum.pluginOutput);

  return {
    inputs: pluginInput
      ? [
          getPluginTemplatePluginIdInput(pluginId),
          ...pluginInput.inputs.map((item) => ({
            ...item,
            edit: false,
            connected: false
          }))
        ]
      : [],
    outputs: customOutput
      ? customOutput.outputs.map((item) => ({
          ...item,
          edit: false
        }))
      : []
  };
}
