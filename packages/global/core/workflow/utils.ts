import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from './node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  VariableInputEnum,
  variableMap
} from './constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './type/io.d';
import { StoreNodeItemType } from './type';
import type {
  VariableItemType,
  AppTTSConfigType,
  AppWhisperConfigType,
  AppScheduledTriggerConfigType,
  ChatInputGuideConfigType,
  AppChatConfigType
} from '../app/type';
import { EditorVariablePickerType } from '../../../web/components/common/Textarea/PromptEditor/type';
import {
  defaultChatInputGuideConfig,
  defaultTTSConfig,
  defaultWhisperConfig
} from '../app/constants';
import { IfElseResultEnum } from './template/system/ifElse/constant';

export const getHandleId = (nodeId: string, type: 'source' | 'target', key: string) => {
  return `${nodeId}-${type}-${key}`;
};

export const checkInputIsReference = (input: FlowNodeInputItemType) => {
  if (input.renderTypeList?.[input?.selectedTypeIndex || 0] === FlowNodeInputTypeEnum.reference)
    return true;

  return false;
};

/* node  */
export const getGuideModule = (modules: StoreNodeItemType[]) =>
  modules.find(
    (item) =>
      item.flowNodeType === FlowNodeTypeEnum.systemConfig ||
      // @ts-ignore (adapt v1)
      item.flowType === FlowNodeTypeEnum.systemConfig
  );
export const splitGuideModule = (guideModules?: StoreNodeItemType) => {
  const welcomeText: string =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.welcomeText)?.value || '';

  const variables: VariableItemType[] =
    guideModules?.inputs.find((item) => item.key === NodeInputKeyEnum.variables)?.value || [];

  const questionGuide: boolean =
    !!guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.questionGuide)?.value ||
    false;

  const ttsConfig: AppTTSConfigType =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.tts)?.value ||
    defaultTTSConfig;

  const whisperConfig: AppWhisperConfigType =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.whisper)?.value ||
    defaultWhisperConfig;

  const scheduledTriggerConfig: AppScheduledTriggerConfigType = guideModules?.inputs?.find(
    (item) => item.key === NodeInputKeyEnum.scheduleTrigger
  )?.value;

  const chatInputGuide: ChatInputGuideConfigType =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.chatInputGuide)?.value ||
    defaultChatInputGuideConfig;

  return {
    welcomeText,
    variables,
    questionGuide,
    ttsConfig,
    whisperConfig,
    scheduledTriggerConfig,
    chatInputGuide
  };
};
export const getAppChatConfig = ({
  chatConfig,
  systemConfigNode,
  storeVariables,
  storeWelcomeText,
  isPublicFetch = false
}: {
  chatConfig?: AppChatConfigType;
  systemConfigNode?: StoreNodeItemType;
  storeVariables?: VariableItemType[];
  storeWelcomeText?: string;
  isPublicFetch: boolean;
}): AppChatConfigType => {
  const {
    welcomeText,
    variables,
    questionGuide,
    ttsConfig,
    whisperConfig,
    scheduledTriggerConfig,
    chatInputGuide
  } = splitGuideModule(systemConfigNode);

  const config: AppChatConfigType = {
    questionGuide,
    ttsConfig,
    whisperConfig,
    scheduledTriggerConfig,
    chatInputGuide,
    ...chatConfig,
    variables: storeVariables ?? chatConfig?.variables ?? variables,
    welcomeText: storeWelcomeText ?? chatConfig?.welcomeText ?? welcomeText
  };

  if (!isPublicFetch) {
    config.scheduledTriggerConfig = undefined;
  }

  return config;
};

export const getOrInitModuleInputValue = (input: FlowNodeInputItemType) => {
  if (input.value !== undefined || !input.valueType) return input.value;

  const map: Record<string, any> = {
    [WorkflowIOValueTypeEnum.boolean]: false,
    [WorkflowIOValueTypeEnum.number]: 0,
    [WorkflowIOValueTypeEnum.string]: ''
  };

  return map[input.valueType];
};

export const getModuleInputUiField = (input: FlowNodeInputItemType) => {
  // if (input.renderTypeList === FlowNodeInputTypeEnum.input || input.type === FlowNodeInputTypeEnum.textarea) {
  //   return {
  //     placeholder: input.placeholder || input.description
  //   };
  // }
  return {};
};

export const pluginData2FlowNodeIO = (
  nodes: StoreNodeItemType[]
): {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
} => {
  const pluginInput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput);
  const pluginOutput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput);

  return {
    inputs: pluginInput
      ? pluginInput.inputs.map((item) => ({
          ...item,
          ...getModuleInputUiField(item),
          value: getOrInitModuleInputValue(item),
          canEdit: false
        }))
      : [],
    outputs: pluginOutput
      ? [
          ...pluginOutput.inputs.map((item) => ({
            id: item.key,
            type: FlowNodeOutputTypeEnum.static,
            key: item.key,
            valueType: item.valueType,
            label: item.label || item.key,
            description: item.description
          }))
        ]
      : []
  };
};

export const formatEditorVariablePickerIcon = (
  variables: { key: string; label: string; type?: `${VariableInputEnum}`; required?: boolean }[]
): EditorVariablePickerType[] => {
  return variables.map((item) => ({
    ...item,
    icon: item.type ? variableMap[item.type]?.icon : variableMap['input'].icon
  }));
};

export const isReferenceValue = (value: any): boolean => {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';
};

export const getElseIFLabel = (i: number) => {
  return i === 0 ? IfElseResultEnum.IF : `${IfElseResultEnum.ELSE_IF} ${i}`;
};
