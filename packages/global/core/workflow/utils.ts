import {
  chatHistoryValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from './node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  VariableInputEnum,
  variableMap,
  VARIABLE_NODE_ID,
  NodeOutputKeyEnum
} from './constants';
import {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceArrayValueType,
  ReferenceItemValueType
} from './type/io.d';
import { StoreNodeItemType } from './type/node';
import type {
  VariableItemType,
  AppTTSConfigType,
  AppWhisperConfigType,
  AppScheduledTriggerConfigType,
  ChatInputGuideConfigType,
  AppChatConfigType,
  AppAutoExecuteConfigType
} from '../app/type';
import { EditorVariablePickerType } from '../../../web/components/common/Textarea/PromptEditor/type';
import {
  defaultAutoExecuteConfig,
  defaultChatInputGuideConfig,
  defaultTTSConfig,
  defaultWhisperConfig
} from '../app/constants';
import { IfElseResultEnum } from './template/system/ifElse/constant';
import { RuntimeNodeItemType } from './runtime/type';
import {
  Input_Template_File_Link,
  Input_Template_History,
  Input_Template_Stream_MODE,
  Input_Template_UserChatInput
} from './template/input';
import { i18nT } from '../../../web/i18n/utils';
import { RuntimeUserPromptType, UserChatItemType } from '../../core/chat/type';
import { getNanoid } from '../../common/string/tools';
import { ChatRoleEnum } from '../../core/chat/constants';
import { runtimePrompt2ChatsValue } from '../../core/chat/adapt';
import { getPluginRunContent } from '../../core/app/plugin/utils';

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
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.welcomeText)?.value ?? '';

  const variables: VariableItemType[] =
    guideModules?.inputs.find((item) => item.key === NodeInputKeyEnum.variables)?.value ?? [];

  const questionGuide: boolean =
    !!guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.questionGuide)?.value ??
    false;

  const ttsConfig: AppTTSConfigType =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.tts)?.value ??
    defaultTTSConfig;

  const whisperConfig: AppWhisperConfigType =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.whisper)?.value ??
    defaultWhisperConfig;

  const scheduledTriggerConfig: AppScheduledTriggerConfigType =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.scheduleTrigger)?.value ??
    undefined;

  const chatInputGuide: ChatInputGuideConfigType =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.chatInputGuide)?.value ??
    defaultChatInputGuideConfig;

  const instruction: string =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.instruction)?.value ?? '';

  const autoExecute: AppAutoExecuteConfigType =
    guideModules?.inputs?.find((item) => item.key === NodeInputKeyEnum.autoExecute)?.value ??
    defaultAutoExecuteConfig;

  return {
    welcomeText,
    variables,
    questionGuide,
    ttsConfig,
    whisperConfig,
    scheduledTriggerConfig,
    chatInputGuide,
    instruction,
    autoExecute
  };
};

// Get app chat config: db > nodes
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
    chatInputGuide,
    instruction,
    autoExecute
  } = splitGuideModule(systemConfigNode);

  const config: AppChatConfigType = {
    questionGuide,
    ttsConfig,
    whisperConfig,
    scheduledTriggerConfig,
    chatInputGuide,
    instruction,
    autoExecute,
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
  if (input.defaultValue !== undefined) return input.defaultValue;

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

export const pluginData2FlowNodeIO = ({
  nodes
}: {
  nodes: StoreNodeItemType[];
}): {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
} => {
  const pluginInput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput);
  const pluginOutput = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginOutput);

  return {
    inputs: pluginInput
      ? [
          Input_Template_Stream_MODE,
          ...pluginInput?.inputs.map((item) => ({
            ...item,
            ...getModuleInputUiField(item),
            value: getOrInitModuleInputValue(item),
            canEdit: false,
            renderTypeList:
              item.renderTypeList[0] === FlowNodeInputTypeEnum.customVariable
                ? [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input]
                : item.renderTypeList
          }))
        ]
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

export const appData2FlowNodeIO = ({
  chatConfig
}: {
  chatConfig?: AppChatConfigType;
}): {
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
} => {
  const variableInput = !chatConfig?.variables
    ? []
    : chatConfig.variables.map((item) => {
        const renderTypeMap = {
          [VariableInputEnum.input]: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          [VariableInputEnum.textarea]: [
            FlowNodeInputTypeEnum.textarea,
            FlowNodeInputTypeEnum.reference
          ],
          [VariableInputEnum.numberInput]: [FlowNodeInputTypeEnum.numberInput],
          [VariableInputEnum.select]: [FlowNodeInputTypeEnum.select],
          [VariableInputEnum.custom]: [
            FlowNodeInputTypeEnum.input,
            FlowNodeInputTypeEnum.reference
          ],
          default: [FlowNodeInputTypeEnum.reference]
        };

        return {
          key: item.key,
          renderTypeList: renderTypeMap[item.type] || renderTypeMap.default,
          label: item.label,
          debugLabel: item.label,
          description: '',
          valueType: WorkflowIOValueTypeEnum.any,
          required: item.required,
          list: item.enums?.map((enumItem) => ({
            label: enumItem.value,
            value: enumItem.value
          }))
        };
      });

  // const showFileLink =
  //   chatConfig?.fileSelectConfig?.canSelectFile || chatConfig?.fileSelectConfig?.canSelectImg;

  return {
    inputs: [
      Input_Template_Stream_MODE,
      Input_Template_History,
      ...(chatConfig?.fileSelectConfig?.canSelectFile || chatConfig?.fileSelectConfig?.canSelectImg
        ? [Input_Template_File_Link]
        : []),
      Input_Template_UserChatInput,
      ...variableInput
    ],
    outputs: [
      {
        id: NodeOutputKeyEnum.history,
        key: NodeOutputKeyEnum.history,
        required: true,
        label: i18nT('common:core.module.output.label.New context'),
        description: i18nT('common:core.module.output.description.New context'),
        valueType: WorkflowIOValueTypeEnum.chatHistory,
        valueDesc: chatHistoryValueDesc,
        type: FlowNodeOutputTypeEnum.static
      },
      {
        id: NodeOutputKeyEnum.answerText,
        key: NodeOutputKeyEnum.answerText,
        required: false,
        label: i18nT('common:core.module.output.label.Ai response content'),
        description: i18nT('common:core.module.output.description.Ai response content'),
        valueType: WorkflowIOValueTypeEnum.string,
        type: FlowNodeOutputTypeEnum.static
      }
    ]
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

// Check the value is a valid reference value format: [variableId, outputId]
export const isValidReferenceValueFormat = (value: any): value is ReferenceItemValueType => {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string';
};
/* 
  Check whether the value([variableId, outputId]) value is a valid reference value:
  1. The value must be an array of length 2
  2. The first item of the array must be one of VARIABLE_NODE_ID or nodeIds
*/
export const isValidReferenceValue = (
  value: any,
  nodeIds: string[]
): value is ReferenceItemValueType => {
  if (!isValidReferenceValueFormat(value)) return false;

  const validIdSet = new Set([VARIABLE_NODE_ID, ...nodeIds]);
  return validIdSet.has(value[0]);
};
/* 
  Check whether the value([variableId, outputId][]) value is a valid reference value array:
  1. The value must be an array
  2. The array must contain at least one element
  3. Each element in the array must be a valid reference value
*/
export const isValidArrayReferenceValue = (
  value: any,
  nodeIds: string[]
): value is ReferenceArrayValueType => {
  if (!Array.isArray(value)) return false;

  return value.every((item) => isValidReferenceValue(item, nodeIds));
};

export const getElseIFLabel = (i: number) => {
  return i === 0 ? IfElseResultEnum.IF : `${IfElseResultEnum.ELSE_IF} ${i}`;
};

// add value to plugin input node when run plugin
export const updatePluginInputByVariables = (
  nodes: RuntimeNodeItemType[],
  variables: Record<string, any>
) => {
  return nodes.map((node) =>
    node.flowNodeType === FlowNodeTypeEnum.pluginInput
      ? {
          ...node,
          inputs: node.inputs.map((input) => {
            const parseValue = (() => {
              try {
                if (
                  input.valueType === WorkflowIOValueTypeEnum.string ||
                  input.valueType === WorkflowIOValueTypeEnum.number ||
                  input.valueType === WorkflowIOValueTypeEnum.boolean
                )
                  return variables[input.key];

                return JSON.parse(variables[input.key]);
              } catch (e) {
                return variables[input.key];
              }
            })();

            return {
              ...input,
              value: parseValue ?? input.value
            };
          })
        }
      : node
  );
};

/* Get plugin runtime input user query */
export const getPluginRunUserQuery = ({
  pluginInputs,
  variables,
  files = []
}: {
  pluginInputs: FlowNodeInputItemType[];
  variables: Record<string, any>;
  files?: RuntimeUserPromptType['files'];
}): UserChatItemType & { dataId: string } => {
  return {
    dataId: getNanoid(24),
    obj: ChatRoleEnum.Human,
    value: runtimePrompt2ChatsValue({
      text: getPluginRunContent({
        pluginInputs: pluginInputs,
        variables
      }),
      files
    })
  };
};
