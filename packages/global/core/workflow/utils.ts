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
  NodeOutputKeyEnum,
  textInputVariableValueTypes
} from './constants';
import {
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType,
  type ReferenceArrayValueType,
  type ReferenceItemValueType
} from './type/io';
import type { NodeToolConfigType, StoreNodeItemType } from './type/node';
import type {
  VariableItemType,
  AppTTSConfigType,
  AppWhisperConfigType,
  AppScheduledTriggerConfigType,
  ChatInputGuideConfigType,
  AppChatConfigType,
  AppAutoExecuteConfigType,
  AppQGConfigType,
  AppSchemaType,
  AppWelcomeConfigType
} from '../app/type';
import { type EditorVariablePickerType } from '../../../web/components/common/Textarea/PromptEditor/type';
import {
  defaultAutoExecuteConfig,
  defaultChatInputGuideConfig,
  defaultQGConfig,
  defaultTTSConfig,
  defaultWhisperConfig
} from '../app/constants';
import { IfElseResultEnum } from './template/system/ifElse/constant';
import {
  Input_Template_File_Link,
  Input_Template_History,
  Input_Template_Stream_MODE,
  Input_Template_UserChatInput
} from './template/input';
import { i18nT } from '../../common/i18n/utils';
import { type RuntimeUserPromptType, type UserChatItemType } from '../../core/chat/type';
import { getNanoid } from '../../common/string/tools';
import { ChatRoleEnum } from '../../core/chat/constants';
import { runtimePrompt2ChatsValue } from '../../core/chat/adapt';

export const getHandleId = (
  nodeId: string,
  type: 'source' | 'source_catch' | 'target',
  key: string
) => {
  return `${nodeId}-${type}-${key}`;
};

/**
 * 判断输入值是否应按工作流引用解析。
 * settingDatasetQuotePrompt 内部渲染 Reference 选择器，虽然 renderType 不是 reference，
 * 但它的值仍是 [nodeId, outputId]，运行时必须解析成知识库检索结果。
 */
export const nodeInputIsReference = (input: FlowNodeInputItemType) => {
  const renderType = input.renderTypeList?.[input?.selectedTypeIndex || 0];

  if (
    renderType === FlowNodeInputTypeEnum.reference ||
    renderType === FlowNodeInputTypeEnum.settingDatasetQuotePrompt
  ) {
    return true;
  }

  return false;
};

/* node  */
export const getGuideModule = (nodes: StoreNodeItemType[]) =>
  nodes.find((item) => item.flowNodeType === FlowNodeTypeEnum.systemConfig);

const isConfigMissing = (value: unknown) => value === undefined || value === null;

const getSystemConfigInputValue = <T>(guideModules: StoreNodeItemType | undefined, key: string) =>
  guideModules?.inputs?.find((item) => item.key === key)?.value as T | undefined;

export const splitGuideModule = (guideModules?: StoreNodeItemType) => {
  const welcomeText: string =
    getSystemConfigInputValue<string>(guideModules, NodeInputKeyEnum.welcomeText) ?? '';

  const welcomeQuestions: string[] =
    getSystemConfigInputValue<string[]>(guideModules, NodeInputKeyEnum.welcomeQuestions) ?? [];

  const variables: VariableItemType[] =
    getSystemConfigInputValue<VariableItemType[]>(guideModules, NodeInputKeyEnum.variables) ?? [];

  // Adapt old version
  const questionGuideVal = getSystemConfigInputValue<AppQGConfigType | boolean>(
    guideModules,
    NodeInputKeyEnum.questionGuide
  );
  const questionGuide: AppQGConfigType =
    typeof questionGuideVal === 'boolean'
      ? { ...defaultQGConfig, open: questionGuideVal }
      : (questionGuideVal ?? defaultQGConfig);

  const ttsConfig: AppTTSConfigType =
    getSystemConfigInputValue<AppTTSConfigType>(guideModules, NodeInputKeyEnum.tts) ??
    defaultTTSConfig;

  const whisperConfig: AppWhisperConfigType =
    getSystemConfigInputValue<AppWhisperConfigType>(guideModules, NodeInputKeyEnum.whisper) ??
    defaultWhisperConfig;

  const scheduledTriggerConfig: AppScheduledTriggerConfigType | undefined =
    getSystemConfigInputValue<AppScheduledTriggerConfigType>(
      guideModules,
      NodeInputKeyEnum.scheduleTrigger
    ) ?? undefined;

  const chatInputGuide: ChatInputGuideConfigType =
    getSystemConfigInputValue<ChatInputGuideConfigType>(
      guideModules,
      NodeInputKeyEnum.chatInputGuide
    ) ?? defaultChatInputGuideConfig;

  const instruction: string =
    getSystemConfigInputValue<string>(guideModules, NodeInputKeyEnum.instruction) ?? '';

  const autoExecute: AppAutoExecuteConfigType =
    getSystemConfigInputValue<AppAutoExecuteConfigType>(
      guideModules,
      NodeInputKeyEnum.autoExecute
    ) ?? defaultAutoExecuteConfig;

  return {
    welcomeText,
    welcomeQuestions,
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

/**
 * 将旧系统配置节点迁入 chatConfig。
 *
 * 只在新版字段为 undefined/null 时用旧节点补值，空字符串、空数组、false 都视为用户明确配置。
 * 这个函数用于编辑态初始化、导入/草稿恢复和后续迁移，避免运行链路继续依赖旧节点兜底。
 */
export const mergeSystemConfigNodeToChatConfig = ({
  chatConfig,
  systemConfigNode
}: {
  chatConfig?: AppChatConfigType;
  systemConfigNode?: StoreNodeItemType;
}): AppChatConfigType => {
  const nextChatConfig: AppChatConfigType = { ...(chatConfig ?? {}) };

  const welcomeConfig: AppWelcomeConfigType = { ...(nextChatConfig.welcomeConfig ?? {}) };
  const nodeWelcomeText = getSystemConfigInputValue<string>(
    systemConfigNode,
    NodeInputKeyEnum.welcomeText
  );
  const nodeWelcomeQuestions = getSystemConfigInputValue<string[]>(
    systemConfigNode,
    NodeInputKeyEnum.welcomeQuestions
  );

  if (isConfigMissing(welcomeConfig.welcomeText) && !isConfigMissing(nextChatConfig.welcomeText)) {
    welcomeConfig.welcomeText = nextChatConfig.welcomeText;
  }
  if (isConfigMissing(welcomeConfig.welcomeText) && !isConfigMissing(nodeWelcomeText)) {
    welcomeConfig.welcomeText = nodeWelcomeText;
  }
  if (isConfigMissing(welcomeConfig.welcomeQuestions) && !isConfigMissing(nodeWelcomeQuestions)) {
    welcomeConfig.welcomeQuestions = nodeWelcomeQuestions;
  }
  if (
    !isConfigMissing(welcomeConfig.welcomeText) ||
    !isConfigMissing(welcomeConfig.welcomeQuestions)
  ) {
    nextChatConfig.welcomeConfig = welcomeConfig;
    nextChatConfig.welcomeText = welcomeConfig.welcomeText;
  }

  const variables = getSystemConfigInputValue<VariableItemType[]>(
    systemConfigNode,
    NodeInputKeyEnum.variables
  );
  if (isConfigMissing(nextChatConfig.variables) && !isConfigMissing(variables)) {
    nextChatConfig.variables = variables;
  }

  const questionGuideVal = getSystemConfigInputValue<AppQGConfigType | boolean>(
    systemConfigNode,
    NodeInputKeyEnum.questionGuide
  );
  if (isConfigMissing(nextChatConfig.questionGuide) && !isConfigMissing(questionGuideVal)) {
    nextChatConfig.questionGuide =
      typeof questionGuideVal === 'boolean'
        ? { ...defaultQGConfig, open: questionGuideVal }
        : questionGuideVal;
  }

  const ttsConfig = getSystemConfigInputValue<AppTTSConfigType>(
    systemConfigNode,
    NodeInputKeyEnum.tts
  );
  if (isConfigMissing(nextChatConfig.ttsConfig) && !isConfigMissing(ttsConfig)) {
    nextChatConfig.ttsConfig = ttsConfig;
  }

  const whisperConfig = getSystemConfigInputValue<AppWhisperConfigType>(
    systemConfigNode,
    NodeInputKeyEnum.whisper
  );
  if (isConfigMissing(nextChatConfig.whisperConfig) && !isConfigMissing(whisperConfig)) {
    nextChatConfig.whisperConfig = whisperConfig;
  }

  const scheduledTriggerConfig = getSystemConfigInputValue<AppScheduledTriggerConfigType>(
    systemConfigNode,
    NodeInputKeyEnum.scheduleTrigger
  );
  if (
    isConfigMissing(nextChatConfig.scheduledTriggerConfig) &&
    !isConfigMissing(scheduledTriggerConfig)
  ) {
    nextChatConfig.scheduledTriggerConfig = scheduledTriggerConfig;
  }

  const chatInputGuide = getSystemConfigInputValue<ChatInputGuideConfigType>(
    systemConfigNode,
    NodeInputKeyEnum.chatInputGuide
  );
  if (isConfigMissing(nextChatConfig.chatInputGuide) && !isConfigMissing(chatInputGuide)) {
    nextChatConfig.chatInputGuide = chatInputGuide;
  }

  const autoExecute = getSystemConfigInputValue<AppAutoExecuteConfigType>(
    systemConfigNode,
    NodeInputKeyEnum.autoExecute
  );
  if (isConfigMissing(nextChatConfig.autoExecute) && !isConfigMissing(autoExecute)) {
    nextChatConfig.autoExecute = autoExecute;
  }

  const instruction = getSystemConfigInputValue<string>(
    systemConfigNode,
    NodeInputKeyEnum.instruction
  );
  if (isConfigMissing(nextChatConfig.instruction) && !isConfigMissing(instruction)) {
    nextChatConfig.instruction = instruction;
  }

  return nextChatConfig;
};

export const filterSystemConfigNodes = (nodes: StoreNodeItemType[]) =>
  nodes.filter((item) => item.flowNodeType !== FlowNodeTypeEnum.systemConfig);

/**
 * 导出新版工作流时生成旧环境可识别的系统配置节点副本。
 *
 * 这个节点只用于导出文件，不应写回新版保存态；新版再次导入时会通过
 * mergeSystemConfigNodeToChatConfig 合并回 chatConfig。
 */
export const chatConfigToSystemConfigNode = ({
  chatConfig,
  name = 'System Config'
}: {
  chatConfig?: AppChatConfigType;
  name?: string;
}): StoreNodeItemType => {
  const welcomeConfig = chatConfig?.welcomeConfig;
  const inputValues: { key: NodeInputKeyEnum; value: unknown }[] = [
    {
      key: NodeInputKeyEnum.welcomeText,
      value: welcomeConfig?.welcomeText ?? chatConfig?.welcomeText
    },
    {
      key: NodeInputKeyEnum.welcomeQuestions,
      value: welcomeConfig?.welcomeQuestions
    },
    { key: NodeInputKeyEnum.variables, value: chatConfig?.variables },
    { key: NodeInputKeyEnum.questionGuide, value: chatConfig?.questionGuide },
    { key: NodeInputKeyEnum.tts, value: chatConfig?.ttsConfig },
    { key: NodeInputKeyEnum.whisper, value: chatConfig?.whisperConfig },
    { key: NodeInputKeyEnum.scheduleTrigger, value: chatConfig?.scheduledTriggerConfig },
    { key: NodeInputKeyEnum.chatInputGuide, value: chatConfig?.chatInputGuide },
    { key: NodeInputKeyEnum.autoExecute, value: chatConfig?.autoExecute },
    { key: NodeInputKeyEnum.instruction, value: chatConfig?.instruction }
  ];

  return {
    nodeId: FlowNodeTypeEnum.systemConfig,
    name,
    intro: '',
    flowNodeType: FlowNodeTypeEnum.systemConfig,
    position: {
      x: 0,
      y: 0
    },
    inputs: inputValues
      .filter((item) => !isConfigMissing(item.value))
      .map((item) => ({
        key: item.key,
        label: item.key,
        value: item.value,
        renderTypeList: [FlowNodeInputTypeEnum.hidden]
      })),
    outputs: []
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
    welcomeQuestions,
    variables,
    questionGuide,
    ttsConfig,
    whisperConfig,
    scheduledTriggerConfig,
    chatInputGuide,
    instruction,
    autoExecute
  } = splitGuideModule(systemConfigNode);

  const welcomeConfig: AppWelcomeConfigType = {
    welcomeText:
      storeWelcomeText ??
      chatConfig?.welcomeConfig?.welcomeText ??
      chatConfig?.welcomeText ??
      welcomeText,
    welcomeQuestions: chatConfig?.welcomeConfig?.welcomeQuestions ?? welcomeQuestions
  };

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
    welcomeConfig,
    welcomeText: welcomeConfig.welcomeText
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
      ? pluginOutput.inputs.map((item) => ({
          id: item.key,
          type: FlowNodeOutputTypeEnum.static,
          key: item.key,
          valueType: item.valueType,
          label: item.label || item.key,
          description: item.description
        }))
      : []
  };
};

const jsonRenderValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.object,
  WorkflowIOValueTypeEnum.arrayString,
  WorkflowIOValueTypeEnum.arrayNumber,
  WorkflowIOValueTypeEnum.arrayBoolean,
  WorkflowIOValueTypeEnum.arrayObject
]);

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
        // Legacy input+非法 valueType（如 number/boolean）视同 string，避免画布控件与 valueType 错配
        const normalizedValueType =
          item.type === VariableInputEnum.input &&
          item.valueType !== undefined &&
          !textInputVariableValueTypes.includes(item.valueType)
            ? WorkflowIOValueTypeEnum.string
            : item.valueType;
        const isJsonValueType =
          !!normalizedValueType && jsonRenderValueTypes.has(normalizedValueType);
        const renderTypeMap: Record<VariableInputEnum, FlowNodeInputTypeEnum[]> = {
          [VariableInputEnum.input]: isJsonValueType
            ? [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference]
            : [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          [VariableInputEnum.textarea]: [
            FlowNodeInputTypeEnum.textarea,
            FlowNodeInputTypeEnum.reference
          ],
          [VariableInputEnum.numberInput]: [FlowNodeInputTypeEnum.numberInput],
          [VariableInputEnum.select]: [FlowNodeInputTypeEnum.select],
          [VariableInputEnum.multipleSelect]: [FlowNodeInputTypeEnum.multipleSelect],
          [VariableInputEnum.timePointSelect]: [FlowNodeInputTypeEnum.timePointSelect],
          [VariableInputEnum.timeRangeSelect]: [FlowNodeInputTypeEnum.timeRangeSelect],
          [VariableInputEnum.switch]: [FlowNodeInputTypeEnum.switch],
          [VariableInputEnum.password]: [FlowNodeInputTypeEnum.password],
          [VariableInputEnum.file]: [
            FlowNodeInputTypeEnum.fileSelect,
            FlowNodeInputTypeEnum.reference
          ],
          [VariableInputEnum.llmSelect]: [FlowNodeInputTypeEnum.selectLLMModel],
          [VariableInputEnum.datasetSelect]: [FlowNodeInputTypeEnum.selectDataset],
          [VariableInputEnum.internal]: [FlowNodeInputTypeEnum.hidden],
          [VariableInputEnum.custom]: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
        };

        return {
          key: item.key,
          renderTypeList: renderTypeMap[item.type] || [FlowNodeInputTypeEnum.reference],
          label: item.label,
          debugLabel: item.label,
          description: '',
          valueType: normalizedValueType || WorkflowIOValueTypeEnum.any,
          required: item.required,
          defaultValue: item.defaultValue,
          value: item.defaultValue,
          list: (item.list || item.enums)?.map((enumItem) => ({
            label: enumItem.value,
            value: enumItem.value
          }))
        };
      });

  return {
    inputs: [
      Input_Template_Stream_MODE,
      Input_Template_History,
      ...(chatConfig?.fileSelectConfig?.canSelectFile ||
      chatConfig?.fileSelectConfig?.canSelectImg ||
      chatConfig?.fileSelectConfig?.canSelectVideo ||
      chatConfig?.fileSelectConfig?.canSelectAudio ||
      chatConfig?.fileSelectConfig?.canSelectCustomFileExtension
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

export const toolData2FlowNodeIO = ({ nodes }: { nodes: StoreNodeItemType[] }) => {
  const toolNode = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.tool);

  return {
    inputs: toolNode?.inputs || [],
    outputs: toolNode?.outputs || [],
    toolConfig: toolNode?.toolConfig
  };
};

export const toolSetData2FlowNodeIO = ({ nodes }: { nodes: StoreNodeItemType[] }) => {
  const toolSetNode = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);

  // 加工 toolConfig, 移除一些无需返回客户端以及无需单独存储到 node 的数据。
  const toolConfig: NodeToolConfigType | undefined = (() => {
    if (!toolSetNode?.toolConfig) return undefined;

    if (toolSetNode.toolConfig.httpToolSet) {
      const toolList = toolSetNode.toolConfig.httpToolSet.toolList.map((tool) => {
        const { requestSchema, inputSchema, outputSchema, ...restTool } = tool;
        return restTool;
      });
      return {
        ...toolSetNode.toolConfig,
        httpToolSet: {
          toolList
        }
      };
    }
    if (toolSetNode.toolConfig.mcpToolSet) {
      const formatToolList = toolSetNode.toolConfig.mcpToolSet.toolList.map((tool) => {
        const { inputSchema, ...restTool } = tool;
        return restTool;
      });
      return {
        ...toolSetNode.toolConfig,
        mcpToolSet: {
          url: '',
          toolList: formatToolList
        }
      };
    }

    return toolSetNode.toolConfig;
  })();

  return {
    inputs: toolSetNode?.inputs || [],
    outputs: toolSetNode?.outputs || [],
    toolConfig,
    showSourceHandle: false,
    showTargetHandle: false
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
export const isValidReferenceValueFormat = (
  value: any,
  nodesMap?:
    | Record<string, Pick<StoreNodeItemType, 'nodeId'>>
    | Map<string, Pick<StoreNodeItemType, 'nodeId'>>
): value is ReferenceItemValueType => {
  if (!(Array.isArray(value) && value.length === 2 && typeof value[0] === 'string')) {
    return false;
  }

  if (!nodesMap) return true;

  const sourceNodeId = value[0];
  if (sourceNodeId === VARIABLE_NODE_ID) return true;

  return nodesMap instanceof Map ? nodesMap.has(sourceNodeId) : !!nodesMap[sourceNodeId];
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

/* Get plugin runtime input user query */
export const clientGetWorkflowToolRunUserQuery = ({
  pluginInputs,
  variables,
  files = []
}: {
  pluginInputs: FlowNodeInputItemType[];
  variables: Record<string, any>;
  files?: RuntimeUserPromptType['files'];
}): UserChatItemType & { dataId: string } => {
  const getPluginRunContent = ({
    pluginInputs,
    variables
  }: {
    pluginInputs: FlowNodeInputItemType[];
    variables: Record<string, any>;
  }) => {
    const pluginInputsWithValue = pluginInputs.map((input) => {
      const { key } = input;
      const value = variables?.hasOwnProperty(key) ? variables[key] : input.defaultValue;

      return {
        ...input,
        value
      };
    });
    return JSON.stringify(pluginInputsWithValue);
  };

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

export const removeUnauthModels = async ({
  modules,
  allowedModels = new Set()
}: {
  modules: AppSchemaType['modules'];
  allowedModels?: Set<string>;
}) => {
  if (modules) {
    modules.forEach((module) => {
      module.inputs.forEach((input) => {
        if (input.key === 'model') {
          // 如果是引用类型（selectedTypeIndex 不为 0 或 value 是数组），跳过检查
          if (input.selectedTypeIndex !== 0 || Array.isArray(input.value)) {
            return;
          }
          if (!allowedModels.has(input.value)) {
            input.value = undefined;
          }
        }
      });
    });
  }
  return modules;
};
