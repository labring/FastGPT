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
import { ModelTypeEnum } from '../ai/constants';
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

export const toolSetData2FlowNodeIO = ({
  nodes,
  toolId
}: {
  nodes: StoreNodeItemType[];
  toolId?: string;
}) => {
  const toolSetNode = nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.toolSet);

  // Toolset source apps keep the full config; client-side workflow references only keep the ID.
  const toolConfig: NodeToolConfigType | undefined = (() => {
    if (!toolSetNode?.toolConfig) return undefined;

    if (toolSetNode.toolConfig.httpToolSet && 'toolList' in toolSetNode.toolConfig.httpToolSet) {
      if (toolId ?? toolSetNode.pluginId) {
        return {
          ...toolSetNode.toolConfig,
          httpToolSet: { toolId: toolId ?? toolSetNode.pluginId! }
        };
      }

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
    if (toolSetNode.toolConfig.mcpToolSet && 'toolList' in toolSetNode.toolConfig.mcpToolSet) {
      if (toolId ?? toolSetNode.pluginId) {
        return {
          ...toolSetNode.toolConfig,
          mcpToolSet: { toolId: toolId ?? toolSetNode.pluginId! }
        };
      }

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

export const workflowModelKeyMappings = [
  [NodeInputKeyEnum.aiModel, NodeInputKeyEnum.aiModelId],
  [NodeInputKeyEnum.datasetSearchRerankModel, NodeInputKeyEnum.datasetSearchRerankModelId],
  [NodeInputKeyEnum.datasetSearchExtensionModel, NodeInputKeyEnum.datasetSearchExtensionModelId],
  [NodeInputKeyEnum.datasetDeepSearchModel, NodeInputKeyEnum.datasetDeepSearchModelId]
] as const;

const systemLLMNodeTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.chatNode,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.queryExtension,
  FlowNodeTypeEnum.agent,
  FlowNodeTypeEnum.toolCall
]);

/**
 * 判断模型字段是否属于 FastGPT 系统模型引用。
 * 外部工具可以自由声明 model/rerankModel 等同名参数，因此不能只根据 key 判断。
 */
export const isWorkflowSystemModelInput = ({
  node,
  input
}: {
  node: Pick<StoreNodeItemType, 'flowNodeType'>;
  input: FlowNodeInputItemType;
}) => {
  if (input.key === NodeInputKeyEnum.aiModel || input.key === NodeInputKeyEnum.aiModelId) {
    const renderTypeList = input.renderTypeList ?? [];
    return (
      renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel) ||
      renderTypeList.includes(FlowNodeInputTypeEnum.settingLLMModel) ||
      systemLLMNodeTypes.has(node.flowNodeType)
    );
  }

  if (
    input.key === NodeInputKeyEnum.datasetSearchRerankModel ||
    input.key === NodeInputKeyEnum.datasetSearchRerankModelId ||
    input.key === NodeInputKeyEnum.datasetSearchExtensionModel ||
    input.key === NodeInputKeyEnum.datasetSearchExtensionModelId ||
    input.key === NodeInputKeyEnum.datasetDeepSearchModel ||
    input.key === NodeInputKeyEnum.datasetDeepSearchModelId
  ) {
    return (
      node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode ||
      node.flowNodeType === FlowNodeTypeEnum.agent
    );
  }

  return false;
};

/**
 * 在 Workflow 写入边界统一格式化模型引用。
 *
 * 动态引用只迁移到 canonical key，不做静态校验。静态引用优先按 modelId、其次按 legacy model
 * 精确解析；无法解析时由调用方按保存、创建或发布场景选择保留、回退或校验策略。回退优先使用
 * 有效的系统默认同类型模型，再使用第一个 active 同类型模型。该函数不承担成员权限判断。
 */
export const formatModels = ({
  nodes,
  chatConfig,
  models = [],
  defaultModelIds = {},
  modelReferencePolicy
}: {
  nodes: StoreNodeItemType[] | undefined;
  chatConfig?: AppSchemaType['chatConfig'];
  models?: Array<{ modelId: string; model: string; type: ModelTypeEnum }>;
  defaultModelIds?: Partial<Record<ModelTypeEnum, string>>;
  modelReferencePolicy: 'preserve' | 'fallback' | 'validate' | 'import';
}) => {
  const missingModels = new Set<string>();
  const getFallbackModelId = (type: ModelTypeEnum) => {
    const defaultModelId = defaultModelIds[type];
    const defaultModel = models.find(
      (item) => item.modelId === defaultModelId && item.type === type
    );
    return defaultModel?.modelId ?? models.find((item) => item.type === type)?.modelId ?? '';
  };
  const isTemplateExpression = (value: unknown) =>
    typeof value === 'string' && /^\{\{.*\}\}$/.test(value);
  const isDynamicModelValue = (value: unknown) =>
    Array.isArray(value) || isTemplateExpression(value);
  const resolveModelId = ({
    modelId,
    model,
    type,
    featureEnabled
  }: {
    modelId?: unknown;
    model?: unknown;
    type: ModelTypeEnum;
    featureEnabled: boolean;
  }) => {
    const matchedModelById =
      modelId !== undefined
        ? models.find((item) => item.modelId === String(modelId) && item.type === type)
        : undefined;
    const matchedModelByName =
      typeof model === 'string'
        ? models.find((item) => item.model === model && item.type === type)
        : undefined;
    const matchedModel =
      matchedModelById ??
      (modelId === undefined || modelReferencePolicy === 'import' ? matchedModelByName : undefined);
    if (matchedModel) return matchedModel.modelId;
    // 草稿必须保留用户现场；canonical 字段存在时绝不能用 legacy 字段隐式修复。
    if (modelReferencePolicy === 'preserve') {
      return modelId !== undefined ? modelId : model;
    }
    // 导入配置中的 modelId 可能来自其他环境；名称也无法解析时清空值。
    // 调用方仍保留 canonical modelId 字段或 input 结构，便于选择器回填有效模型。
    if (modelReferencePolicy === 'import') {
      return undefined;
    }
    if (modelReferencePolicy === 'fallback' || !featureEnabled) {
      return getFallbackModelId(type);
    }

    const label =
      modelId !== undefined
        ? String(modelId).length > 0
          ? String(modelId)
          : '未配置'
        : typeof model === 'string' && model.length > 0
          ? model
          : '未配置';
    missingModels.add(label);
    return '';
  };
  const formatChatModelReference = ({
    config,
    type,
    featureEnabled
  }: {
    config?: { modelId?: unknown; model?: unknown };
    type: ModelTypeEnum;
    featureEnabled: boolean;
  }) => {
    if (!config) return;
    if (config.modelId === undefined && config.model === undefined) return;
    if (isDynamicModelValue(config.modelId)) {
      delete config.model;
      return;
    }
    if (config.modelId === undefined && isDynamicModelValue(config.model)) {
      config.modelId = config.model;
      delete config.model;
      return;
    }

    config.modelId = resolveModelId({
      modelId: config.modelId,
      model: config.model,
      type,
      featureEnabled
    });
    delete config.model;
  };
  formatChatModelReference({
    config: chatConfig?.questionGuide,
    type: ModelTypeEnum.llm,
    featureEnabled: chatConfig?.questionGuide?.open === true
  });
  formatChatModelReference({
    config: chatConfig?.ttsConfig,
    type: ModelTypeEnum.tts,
    featureEnabled: chatConfig?.ttsConfig?.type === 'model'
  });

  if (!nodes) {
    if (modelReferencePolicy === 'validate' && missingModels.size > 0) {
      throw new Error(`${Array.from(missingModels).join('、')} 模型已停用`);
    }
    return nodes;
  }

  const isReferenceInput = (input: FlowNodeInputItemType) =>
    getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.reference ||
    Array.isArray(input.value);
  const isDynamicModelInput = (input: FlowNodeInputItemType) =>
    isReferenceInput(input) || isTemplateExpression(input.value);

  const formatNestedModelReference = ({
    config,
    legacyKey,
    modelIdKey,
    type,
    featureEnabled
  }: {
    config: Record<string, unknown>;
    legacyKey: string;
    modelIdKey: string;
    type: ModelTypeEnum;
    featureEnabled: boolean;
  }) => {
    const modelId = config[modelIdKey];
    const model = config[legacyKey];
    if (modelId === undefined && model === undefined) return;
    if (isDynamicModelValue(modelId)) {
      delete config[legacyKey];
      return;
    }
    if (modelId === undefined && isDynamicModelValue(model)) {
      config[modelIdKey] = model;
      delete config[legacyKey];
      return;
    }

    config[modelIdKey] = resolveModelId({
      modelId,
      model,
      type,
      featureEnabled
    });
    delete config[legacyKey];
  };

  nodes.forEach((node) => {
    for (const [legacyKey, modelIdKey] of workflowModelKeyMappings) {
      const legacyInput = node.inputs.find((input) => input.key === legacyKey);
      const modelIdInput = node.inputs.find((input) => input.key === modelIdKey);

      const systemModelInput = modelIdInput ?? legacyInput;
      if (!systemModelInput || !isWorkflowSystemModelInput({ node, input: systemModelInput })) {
        continue;
      }

      const type =
        legacyKey === NodeInputKeyEnum.datasetSearchRerankModel
          ? ModelTypeEnum.rerank
          : ModelTypeEnum.llm;
      const featureEnabled = (() => {
        const featureKey = (() => {
          if (legacyKey === NodeInputKeyEnum.datasetSearchRerankModel) {
            return NodeInputKeyEnum.datasetSearchUsingReRank;
          }
          if (legacyKey === NodeInputKeyEnum.datasetSearchExtensionModel) {
            return NodeInputKeyEnum.datasetSearchUsingExtensionQuery;
          }
          if (legacyKey === NodeInputKeyEnum.datasetDeepSearchModel) {
            return NodeInputKeyEnum.datasetDeepSearch;
          }
        })();
        if (!featureKey) return true;
        return Boolean(node.inputs.find((input) => input.key === featureKey)?.value);
      })();

      // modelId 始终优先；存在 canonical input 时删除所有对应旧 input。
      if (modelIdInput) {
        if (!isDynamicModelInput(modelIdInput)) {
          modelIdInput.value = resolveModelId({
            modelId: modelIdInput.value,
            model: legacyInput?.value,
            type,
            featureEnabled
          });
        }
        node.inputs = node.inputs.filter((input) => input.key !== legacyKey);
        continue;
      }

      if (!legacyInput) continue;

      if (!isDynamicModelInput(legacyInput)) {
        legacyInput.value = resolveModelId({
          model: legacyInput.value,
          type,
          featureEnabled
        });
      }
      legacyInput.key = modelIdKey;
      // 历史异常数据可能存在重复旧 key，转换首个后一并移除。
      node.inputs = node.inputs.filter((input) => input.key !== legacyKey);
    }

    const datasetParamsInput = node.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetParams
    );
    if (
      node.flowNodeType === FlowNodeTypeEnum.agent &&
      datasetParamsInput?.value &&
      typeof datasetParamsInput.value === 'object' &&
      !Array.isArray(datasetParamsInput.value)
    ) {
      const datasetParams = datasetParamsInput.value as Record<string, unknown>;
      formatNestedModelReference({
        config: datasetParams,
        legacyKey: NodeInputKeyEnum.datasetSearchRerankModel,
        modelIdKey: NodeInputKeyEnum.datasetSearchRerankModelId,
        type: ModelTypeEnum.rerank,
        featureEnabled: Boolean(datasetParams[NodeInputKeyEnum.datasetSearchUsingReRank])
      });
      formatNestedModelReference({
        config: datasetParams,
        legacyKey: NodeInputKeyEnum.datasetSearchExtensionModel,
        modelIdKey: NodeInputKeyEnum.datasetSearchExtensionModelId,
        type: ModelTypeEnum.llm,
        featureEnabled: Boolean(datasetParams[NodeInputKeyEnum.datasetSearchUsingExtensionQuery])
      });
    }
  });

  if (modelReferencePolicy === 'validate' && missingModels.size > 0) {
    throw new Error(`${Array.from(missingModels).join('、')} 模型已停用`);
  }

  return nodes;
};

/**
 * 为 JSON 导出补充可跨环境解析的 legacy model 名称，同时保留当前环境的 modelId。
 *
 * 只处理 FastGPT 系统模型引用；插件自定义的同名参数不会被改写。动态引用没有可反查的
 * 静态模型，因此不生成 legacy 字段。无法从当前模型目录解析的 ID 保持原样。
 */
export const addModelNamesToWorkflow = ({
  nodes,
  chatConfig,
  models = []
}: {
  nodes?: StoreNodeItemType[];
  chatConfig?: AppSchemaType['chatConfig'];
  models?: Array<{ modelId: string; model: string; type: ModelTypeEnum }>;
}) => {
  const findModelName = ({ modelId, type }: { modelId: unknown; type: ModelTypeEnum }) => {
    if (typeof modelId !== 'string' || /^\{\{.*\}\}$/.test(modelId)) return;
    return models.find((item) => item.modelId === modelId && item.type === type)?.model;
  };
  const addConfigModelName = ({
    config,
    type
  }: {
    config?: { modelId?: unknown; model?: unknown };
    type: ModelTypeEnum;
  }) => {
    if (!config) return;
    const model = findModelName({ modelId: config.modelId, type });
    if (model !== undefined) config.model = model;
  };

  addConfigModelName({ config: chatConfig?.questionGuide, type: ModelTypeEnum.llm });
  addConfigModelName({ config: chatConfig?.ttsConfig, type: ModelTypeEnum.tts });

  nodes?.forEach((node) => {
    for (const [legacyKey, modelIdKey] of workflowModelKeyMappings) {
      const modelIdInput = node.inputs.find((input) => input.key === modelIdKey);
      if (!modelIdInput || !isWorkflowSystemModelInput({ node, input: modelIdInput })) continue;

      const type =
        legacyKey === NodeInputKeyEnum.datasetSearchRerankModel
          ? ModelTypeEnum.rerank
          : ModelTypeEnum.llm;
      const model = findModelName({ modelId: modelIdInput.value, type });
      if (model === undefined) continue;

      const legacyInput = node.inputs.find(
        (input) => input.key === legacyKey && isWorkflowSystemModelInput({ node, input })
      );
      if (legacyInput) {
        legacyInput.value = model;
      } else {
        node.inputs.push({ ...modelIdInput, key: legacyKey, value: model });
      }
    }

    const datasetParamsInput = node.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetParams
    );
    if (
      node.flowNodeType !== FlowNodeTypeEnum.agent ||
      !datasetParamsInput?.value ||
      typeof datasetParamsInput.value !== 'object' ||
      Array.isArray(datasetParamsInput.value)
    ) {
      return;
    }

    const datasetParams = datasetParamsInput.value as Record<string, unknown>;
    const addNestedModelName = ({
      modelIdKey,
      legacyKey,
      type
    }: {
      modelIdKey: string;
      legacyKey: string;
      type: ModelTypeEnum;
    }) => {
      const model = findModelName({ modelId: datasetParams[modelIdKey], type });
      if (model !== undefined) datasetParams[legacyKey] = model;
    };
    addNestedModelName({
      modelIdKey: NodeInputKeyEnum.datasetSearchRerankModelId,
      legacyKey: NodeInputKeyEnum.datasetSearchRerankModel,
      type: ModelTypeEnum.rerank
    });
    addNestedModelName({
      modelIdKey: NodeInputKeyEnum.datasetSearchExtensionModelId,
      legacyKey: NodeInputKeyEnum.datasetSearchExtensionModel,
      type: ModelTypeEnum.llm
    });
  });

  return nodes;
};
