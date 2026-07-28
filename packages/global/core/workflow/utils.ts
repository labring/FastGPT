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
import type { AppChatConfigType, AppSchemaType, AppWelcomeConfigType } from '../app/type';
import type { VariableItemType } from '../app/variable/type';
import { normalizeAndParseVariableList } from '../app/variable/utils';
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

export const getSelectedInputRenderType = (input: {
  renderTypeList?: FlowNodeInputItemType['renderTypeList'];
  selectedType?: FlowNodeInputItemType['selectedType'];
}) => input.selectedType ?? input.renderTypeList?.[0];

export const getSelectedInputRenderTypeIndex = (input: {
  renderTypeList?: FlowNodeInputItemType['renderTypeList'];
  selectedType?: FlowNodeInputItemType['selectedType'];
}) => {
  const selectedRenderType = getSelectedInputRenderType(input);
  const selectedRenderTypePosition = selectedRenderType
    ? input.renderTypeList?.findIndex((renderType) => renderType === selectedRenderType)
    : -1;

  return selectedRenderTypePosition !== undefined && selectedRenderTypePosition >= 0
    ? selectedRenderTypePosition
    : 0;
};

/**
 * 判断输入值是否应按工作流引用解析。
 * settingDatasetQuotePrompt 内部渲染 Reference 选择器，虽然 renderType 不是 reference，
 * 但它的值仍是 [nodeId, outputId]，运行时必须解析成知识库检索结果。
 */
export const nodeInputIsReference = (input: FlowNodeInputItemType) => {
  const renderType = getSelectedInputRenderType(input);

  if (
    renderType === FlowNodeInputTypeEnum.reference ||
    renderType === FlowNodeInputTypeEnum.settingDatasetQuotePrompt
  ) {
    return true;
  }

  return false;
};

const workflowReferenceSourceTypeMap: Record<WorkflowIOValueTypeEnum, WorkflowIOValueTypeEnum[]> = {
  [WorkflowIOValueTypeEnum.string]: [WorkflowIOValueTypeEnum.string],
  [WorkflowIOValueTypeEnum.number]: [WorkflowIOValueTypeEnum.number],
  [WorkflowIOValueTypeEnum.boolean]: [WorkflowIOValueTypeEnum.boolean],
  [WorkflowIOValueTypeEnum.object]: [WorkflowIOValueTypeEnum.object],
  [WorkflowIOValueTypeEnum.arrayString]: [
    WorkflowIOValueTypeEnum.string,
    WorkflowIOValueTypeEnum.arrayString,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.arrayNumber]: [
    WorkflowIOValueTypeEnum.number,
    WorkflowIOValueTypeEnum.arrayNumber,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.arrayBoolean]: [
    WorkflowIOValueTypeEnum.boolean,
    WorkflowIOValueTypeEnum.arrayBoolean,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.arrayObject]: [
    WorkflowIOValueTypeEnum.object,
    WorkflowIOValueTypeEnum.arrayObject,
    WorkflowIOValueTypeEnum.arrayAny,
    WorkflowIOValueTypeEnum.chatHistory,
    WorkflowIOValueTypeEnum.datasetQuote,
    WorkflowIOValueTypeEnum.dynamic,
    WorkflowIOValueTypeEnum.selectDataset,
    WorkflowIOValueTypeEnum.selectApp
  ],
  [WorkflowIOValueTypeEnum.chatHistory]: [
    WorkflowIOValueTypeEnum.chatHistory,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.datasetQuote]: [
    WorkflowIOValueTypeEnum.datasetQuote,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.dynamic]: [
    WorkflowIOValueTypeEnum.dynamic,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.selectDataset]: [
    WorkflowIOValueTypeEnum.selectDataset,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.selectApp]: [
    WorkflowIOValueTypeEnum.selectApp,
    WorkflowIOValueTypeEnum.arrayAny
  ],
  [WorkflowIOValueTypeEnum.arrayAny]: Object.values(WorkflowIOValueTypeEnum),
  [WorkflowIOValueTypeEnum.any]: Object.values(WorkflowIOValueTypeEnum)
};

/**
 * 返回 Web 引用选择器和 Workflow Core 共同接受的上游输出类型。
 * 数组输入允许引用同类型数组、通用数组或一个元素类型，运行时会按目标类型完成格式化。
 */
export const getWorkflowReferenceSourceValueTypes = (
  expected?: string
): WorkflowIOValueTypeEnum[] => {
  if (expected === undefined) return Object.values(WorkflowIOValueTypeEnum);
  const acceptedTypes = workflowReferenceSourceTypeMap[expected as WorkflowIOValueTypeEnum] ?? [];
  return [...new Set([...acceptedTypes, WorkflowIOValueTypeEnum.any])];
};

/** 判断一个上游输出类型能否作为目标输入的完整引用值。 */
export const areWorkflowValueTypesCompatible = ({
  expected,
  actual
}: {
  expected?: string;
  actual?: string;
}) => {
  if (expected === undefined || actual === undefined || actual === WorkflowIOValueTypeEnum.any) {
    return true;
  }
  return getWorkflowReferenceSourceValueTypes(expected).includes(actual as WorkflowIOValueTypeEnum);
};

/* node  */
export const getGuideModule = (nodes: StoreNodeItemType[]) =>
  nodes.find((item) => item.flowNodeType === FlowNodeTypeEnum.systemConfig);

/** 判断 App 工作流是否有 Agent 或 ToolCall 节点开启 Sandbox。 */
export const isAppSandboxEnabledInNodes = (nodes: StoreNodeItemType[]) =>
  nodes.some(
    (node) =>
      (node.flowNodeType === FlowNodeTypeEnum.agent ||
        node.flowNodeType === FlowNodeTypeEnum.toolCall) &&
      node.inputs.some(
        (input) => input.key === NodeInputKeyEnum.useAgentSandbox && input.value === true
      )
  );

/**
 * 合并应用配置与会话快照，并返回运行时对话配置。
 *
 * 会话变量会在这里统一补齐 valueType 并通过变量 schema 校验；读取历史会话和保存新快照共用该边界。
 */
export const getAppChatConfig = ({
  chatConfig,
  storeVariables,
  storeWelcomeText,
  isPublicFetch = false
}: {
  chatConfig?: AppChatConfigType;
  storeVariables?: VariableItemType[];
  storeWelcomeText?: string;
  isPublicFetch: boolean;
}): AppChatConfigType => {
  const welcomeConfig: AppWelcomeConfigType = {
    welcomeText:
      storeWelcomeText ?? chatConfig?.welcomeConfig?.welcomeText ?? chatConfig?.welcomeText,
    welcomeQuestions: chatConfig?.welcomeConfig?.welcomeQuestions
  };

  const config: AppChatConfigType = {
    questionGuide: defaultQGConfig,
    ttsConfig: defaultTTSConfig,
    whisperConfig: defaultWhisperConfig,
    chatInputGuide: defaultChatInputGuideConfig,
    autoExecute: defaultAutoExecuteConfig,
    ...chatConfig,
    variables: normalizeAndParseVariableList(storeVariables ?? chatConfig?.variables ?? []),
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
  void input;
  // if (input.renderTypeList === FlowNodeInputTypeEnum.input || input.type === FlowNodeInputTypeEnum.textarea) {
  //   return {
  //     placeholder: input.placeholder || input.description
  //   };
  // }
  return {};
};

const agentGeneratedExternalVariableValueTypes = new Set<WorkflowIOValueTypeEnum>([
  WorkflowIOValueTypeEnum.string,
  WorkflowIOValueTypeEnum.number,
  WorkflowIOValueTypeEnum.boolean,
  WorkflowIOValueTypeEnum.arrayString,
  WorkflowIOValueTypeEnum.arrayNumber,
  WorkflowIOValueTypeEnum.arrayBoolean
]);

/**
 * 将子工作流外部变量投影为父工作流可配置的节点输入。
 * customVariable 只描述子工作流的外部注入语义；进入父工作流后由引用或类型匹配的手动控件提供值。
 * 已保存且投影后仍有效的输入方式必须保留，只有未选择或仍为 customVariable 时才应用 Agent 默认值。
 */
export const projectExternalVariableInput = <T extends FlowNodeInputItemType>(input: T): T => {
  const isExternalVariable =
    input.renderTypeList.includes(FlowNodeInputTypeEnum.customVariable) ||
    input.selectedType === FlowNodeInputTypeEnum.customVariable;
  if (!isExternalVariable) return input;

  const manualRenderType = (() => {
    if (input.valueType === WorkflowIOValueTypeEnum.number) {
      return FlowNodeInputTypeEnum.numberInput;
    }
    if (input.valueType === WorkflowIOValueTypeEnum.boolean) {
      return FlowNodeInputTypeEnum.switch;
    }
    if (input.valueType === WorkflowIOValueTypeEnum.string) {
      return FlowNodeInputTypeEnum.input;
    }
    return FlowNodeInputTypeEnum.JSONEditor;
  })();
  const canAgentGenerated = agentGeneratedExternalVariableValueTypes.has(
    input.valueType as WorkflowIOValueTypeEnum
  );
  const projectedRenderTypeList = Array.from(
    new Set(
      input.renderTypeList.flatMap((type) => {
        if (type === FlowNodeInputTypeEnum.customVariable) {
          return [FlowNodeInputTypeEnum.reference, manualRenderType];
        }
        if (type === FlowNodeInputTypeEnum.agentGenerated) {
          return canAgentGenerated ? [type] : [];
        }
        return [type];
      })
    )
  );
  if (
    canAgentGenerated &&
    !projectedRenderTypeList.includes(FlowNodeInputTypeEnum.agentGenerated)
  ) {
    projectedRenderTypeList.unshift(FlowNodeInputTypeEnum.agentGenerated);
  }
  if (!projectedRenderTypeList.includes(FlowNodeInputTypeEnum.reference)) {
    projectedRenderTypeList.push(FlowNodeInputTypeEnum.reference);
  }
  if (!projectedRenderTypeList.includes(manualRenderType)) {
    projectedRenderTypeList.push(manualRenderType);
  }
  const hasExplicitProjectedSelection =
    input.selectedType !== undefined &&
    input.selectedType !== FlowNodeInputTypeEnum.customVariable &&
    projectedRenderTypeList.includes(input.selectedType);
  const selectedType = hasExplicitProjectedSelection
    ? input.selectedType
    : canAgentGenerated
      ? FlowNodeInputTypeEnum.agentGenerated
      : FlowNodeInputTypeEnum.reference;
  const projectedInput = {
    ...input,
    canAgentGenerated,
    ...(canAgentGenerated ? { defaultToAgentGenerated: true } : {}),
    renderTypeList: projectedRenderTypeList,
    selectedType
  } as T;

  return projectedInput;
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
          ...pluginInput?.inputs.map((item) =>
            projectExternalVariableInput({
              ...item,
              ...getModuleInputUiField(item),
              value: getOrInitModuleInputValue(item),
              canEdit: false
            })
          )
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

/** 将应用变量类型映射为工作流节点输入控件，供应用节点和工具参数配置共用。 */
export const getAppVariableRenderTypeList = ({
  type,
  valueType
}: Pick<VariableItemType, 'type' | 'valueType'>): FlowNodeInputTypeEnum[] => {
  const isJsonValueType = !!valueType && jsonRenderValueTypes.has(valueType);
  const renderTypeMap: Record<VariableInputEnum, FlowNodeInputTypeEnum[]> = {
    [VariableInputEnum.input]: isJsonValueType
      ? [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference]
      : [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
    [VariableInputEnum.textarea]: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
    [VariableInputEnum.numberInput]: [FlowNodeInputTypeEnum.numberInput],
    [VariableInputEnum.select]: [FlowNodeInputTypeEnum.select],
    [VariableInputEnum.multipleSelect]: [FlowNodeInputTypeEnum.multipleSelect],
    [VariableInputEnum.timePointSelect]: [FlowNodeInputTypeEnum.timePointSelect],
    [VariableInputEnum.timeRangeSelect]: [FlowNodeInputTypeEnum.timeRangeSelect],
    [VariableInputEnum.switch]: [FlowNodeInputTypeEnum.switch],
    [VariableInputEnum.password]: [FlowNodeInputTypeEnum.password],
    [VariableInputEnum.file]: [FlowNodeInputTypeEnum.fileSelect, FlowNodeInputTypeEnum.reference],
    [VariableInputEnum.llmSelect]: [FlowNodeInputTypeEnum.selectLLMModel],
    [VariableInputEnum.datasetSelect]: [FlowNodeInputTypeEnum.selectDataset],
    [VariableInputEnum.internal]: [FlowNodeInputTypeEnum.hidden],
    [VariableInputEnum.custom]: [FlowNodeInputTypeEnum.customVariable]
  };

  return renderTypeMap[type] || [FlowNodeInputTypeEnum.reference];
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
        // Legacy input+非法 valueType（如 number/boolean）视同 string，避免画布控件与 valueType 错配
        const normalizedValueType =
          item.type === VariableInputEnum.input &&
          item.valueType !== undefined &&
          !textInputVariableValueTypes.includes(item.valueType)
            ? WorkflowIOValueTypeEnum.string
            : item.valueType;
        const supportsOptions = [
          VariableInputEnum.select,
          VariableInputEnum.multipleSelect
        ].includes(item.type);
        return projectExternalVariableInput({
          key: item.key,
          renderTypeList: getAppVariableRenderTypeList({
            type: item.type,
            valueType: normalizedValueType
          }),
          label: item.label,
          debugLabel: item.label,
          description: item.description,
          valueType: normalizedValueType || WorkflowIOValueTypeEnum.any,
          required: item.required,
          defaultValue: item.defaultValue,
          value: item.defaultValue,
          ...(supportsOptions
            ? {
                list: (item.list || item.enums)
                  ?.map((enumItem) => ({
                    label: enumItem.value,
                    value: enumItem.value
                  }))
                  .filter((enumItem) => String(enumItem.value ?? '').trim().length > 0)
              }
            : {})
        });
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
        ? [
            {
              ...Input_Template_File_Link,
              renderTypeList: [
                ...Input_Template_File_Link.renderTypeList,
                FlowNodeInputTypeEnum.agentGenerated
              ],
              selectedType: FlowNodeInputTypeEnum.agentGenerated,
              defaultToAgentGenerated: true
            }
          ]
        : []),
      {
        ...Input_Template_UserChatInput,
        // 普通工作流作为工具时，用户问题应默认由调用它的 Agent 生成。
        defaultToAgentGenerated: true
      },
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
        const restTool = { ...tool };
        delete restTool.requestSchema;
        delete restTool.inputSchema;
        delete restTool.outputSchema;
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
        const restTool = { ...tool };
        delete restTool.inputSchema;
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
    const pluginInputsWithValue = pluginInputs
      .filter((input) => !input.renderTypeList.includes(FlowNodeInputTypeEnum.hidden))
      .map((input) => {
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
          // 如果是引用类型或历史引用值，跳过静态模型白名单检查。
          if (
            getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.reference ||
            Array.isArray(input.value)
          ) {
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
