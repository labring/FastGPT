import {
  FlowNodeInputTypeEnum,
  FlowNodeSpecialInputKeyEnum,
  FlowNodeTypeEnum
} from './node/constant';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';
import { ModuleItemType } from './type';

export function formatPluginIOModules(
  pluginId: string,
  modules: ModuleItemType[]
): {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
} {
  const customInput = modules.find((module) => module.flowType === FlowNodeTypeEnum.customInput);
  const customOutput = modules.find((module) => module.flowType === FlowNodeTypeEnum.customIOutput);

  return {
    inputs: customInput
      ? [
          {
            key: FlowNodeSpecialInputKeyEnum.pluginId,
            type: FlowNodeInputTypeEnum.hidden,
            label: 'pluginId',
            value: pluginId,
            connected: true
          },
          ...customInput.inputs.map((item) => ({
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
