import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from './node/constant';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  VariableInputEnum,
  variableMap
} from './constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';
import { AppTTSConfigType, ModuleItemType, VariableItemType } from './type';
import { Input_Template_Switch } from './template/input';
import { EditorVariablePickerType } from '../../../web/components/common/Textarea/PromptEditor/type';
import { Output_Template_Finish } from './template/output';

/* module  */
export const getGuideModule = (modules: ModuleItemType[]) =>
  modules.find((item) => item.flowType === FlowNodeTypeEnum.userGuide);

export const splitGuideModule = (guideModules?: ModuleItemType) => {
  const welcomeText: string =
    guideModules?.inputs?.find((item) => item.key === ModuleInputKeyEnum.welcomeText)?.value || '';

  const variableModules: VariableItemType[] =
    guideModules?.inputs.find((item) => item.key === ModuleInputKeyEnum.variables)?.value || [];

  const questionGuide: boolean =
    !!guideModules?.inputs?.find((item) => item.key === ModuleInputKeyEnum.questionGuide)?.value ||
    false;

  const ttsConfig: AppTTSConfigType = guideModules?.inputs?.find(
    (item) => item.key === ModuleInputKeyEnum.tts
  )?.value || { type: 'web' };

  return {
    welcomeText,
    variableModules,
    questionGuide,
    ttsConfig
  };
};

export const getOrInitModuleInputValue = (input: FlowNodeInputItemType) => {
  if (input.value !== undefined || !input.valueType) return input.value;

  const map: Record<string, any> = {
    [ModuleIOValueTypeEnum.boolean]: false,
    [ModuleIOValueTypeEnum.number]: 0,
    [ModuleIOValueTypeEnum.string]: ''
  };

  return map[input.valueType];
};

export const getModuleInputUiField = (input: FlowNodeInputItemType) => {
  if (input.type === FlowNodeInputTypeEnum.input || input.type === FlowNodeInputTypeEnum.textarea) {
    return {
      placeholder: input.placeholder || input.description
    };
  }
  return {};
};

export const plugin2ModuleIO = (
  pluginId: string,
  modules: ModuleItemType[]
): {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
} => {
  const pluginInput = modules.find((module) => module.flowType === FlowNodeTypeEnum.pluginInput);
  const pluginOutput = modules.find((module) => module.flowType === FlowNodeTypeEnum.pluginOutput);

  return {
    inputs: pluginInput
      ? [
          {
            // plugin id
            key: ModuleInputKeyEnum.pluginId,
            type: FlowNodeInputTypeEnum.hidden,
            label: '',
            value: pluginId,
            valueType: ModuleIOValueTypeEnum.string,
            connected: true,
            showTargetInApp: false,
            showTargetInPlugin: false
          },
          // switch
          Input_Template_Switch,
          ...pluginInput.inputs.map((item) => ({
            ...item,
            ...getModuleInputUiField(item),
            value: getOrInitModuleInputValue(item),
            edit: false,
            connected: false
          }))
        ]
      : [Input_Template_Switch],
    outputs: pluginOutput
      ? [
          ...pluginOutput.outputs.map((item) => ({
            ...item,
            edit: false
          })),
          Output_Template_Finish
        ]
      : [Output_Template_Finish]
  };
};

export const formatEditorVariablePickerIcon = (
  variables: { key: string; label: string; type?: `${VariableInputEnum}` }[]
): EditorVariablePickerType[] => {
  return variables.map((item) => ({
    ...item,
    icon: item.type ? variableMap[item.type]?.icon : variableMap['input'].icon
  }));
};
