import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '../../workflow/constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../workflow/node/constant';
import type { FlowNodeInputItemType } from '../../workflow/type/io';
import type { FlowNodeTemplateType } from '../../workflow/type/node';
import type { CanonicalFlowNodeInputItem } from '../../workflow/migration';
import { getSelectedInputRenderType } from '../../workflow/utils';
import type { SelectedToolItemType } from './type';
import { AgentToolInputModeEnum } from '../tool/constants';

export { getSelectedInputRenderType } from '../../workflow/utils';

const formRenderTypesMap: Record<string, boolean> = {
  [FlowNodeInputTypeEnum.input]: true,
  [FlowNodeInputTypeEnum.textarea]: true,
  [FlowNodeInputTypeEnum.numberInput]: true,
  [FlowNodeInputTypeEnum.password]: true,
  [FlowNodeInputTypeEnum.switch]: true,
  [FlowNodeInputTypeEnum.select]: true,
  [FlowNodeInputTypeEnum.multipleSelect]: true,
  [FlowNodeInputTypeEnum.JSONEditor]: true,
  [FlowNodeInputTypeEnum.timePointSelect]: true,
  [FlowNodeInputTypeEnum.timeRangeSelect]: true
};

const agentGeneratedDenyRenderTypes = new Set<FlowNodeInputTypeEnum>([
  FlowNodeInputTypeEnum.fileSelect,
  FlowNodeInputTypeEnum.password,
  FlowNodeInputTypeEnum.selectLLMModel,
  FlowNodeInputTypeEnum.settingLLMModel,
  FlowNodeInputTypeEnum.hidden,
  FlowNodeInputTypeEnum.customVariable,
  FlowNodeInputTypeEnum.custom,
  FlowNodeInputTypeEnum.addInputParam,
  FlowNodeInputTypeEnum.selectApp,
  FlowNodeInputTypeEnum.selectSkill,
  FlowNodeInputTypeEnum.selectTool,
  FlowNodeInputTypeEnum.selectDataset,
  FlowNodeInputTypeEnum.selectDatasetParamsModal,
  FlowNodeInputTypeEnum.settingDatasetQuotePrompt
]);

// 工具配置不能处理依赖文件、知识库、模型或外部动态上下文的输入。
const unsupportedToolInputRenderTypes = new Set<FlowNodeInputTypeEnum>([
  FlowNodeInputTypeEnum.fileSelect,
  FlowNodeInputTypeEnum.selectDataset,
  FlowNodeInputTypeEnum.selectDatasetParamsModal,
  FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
  FlowNodeInputTypeEnum.selectLLMModel,
  FlowNodeInputTypeEnum.settingLLMModel,
  FlowNodeInputTypeEnum.customVariable,
  FlowNodeInputTypeEnum.addInputParam
]);

type InputRenderTypeState = {
  renderTypeList?: FlowNodeInputItemType['renderTypeList'];
  selectedType?: FlowNodeInputItemType['selectedType'];
};

type SavedToolInputTypeState = InputRenderTypeState;

type ToolInputTypeState = InputRenderTypeState &
  Pick<FlowNodeInputItemType, 'key' | 'renderTypeList'> &
  Pick<
    Partial<FlowNodeInputItemType>,
    'defaultToAgentGenerated' | 'toolDescription' | 'list' | 'enums' | 'enum' | 'valueType'
  >;

type ToolInputDefaultModeOptions = {
  forceDefaultMode?: boolean;
  allowUserChatInputAgentGenerated?: boolean;
};

export type NormalizeFlowNodeInputTypeOptions = {
  isTool?: boolean;
  forceDefaultMode?: boolean;
  deferDefaultSelection?: boolean;
};

const manualInputRenderTypes = new Set<FlowNodeInputTypeEnum>([
  FlowNodeInputTypeEnum.input,
  FlowNodeInputTypeEnum.textarea,
  FlowNodeInputTypeEnum.numberInput,
  FlowNodeInputTypeEnum.switch,
  FlowNodeInputTypeEnum.select,
  FlowNodeInputTypeEnum.multipleSelect,
  FlowNodeInputTypeEnum.JSONEditor,
  FlowNodeInputTypeEnum.timePointSelect,
  FlowNodeInputTypeEnum.timeRangeSelect,
  FlowNodeInputTypeEnum.password
]);

/**
 * 判断工具入参当前最终类型是否为 Agent 生成。
 */
export const isAgentGeneratedToolInput = (input: InputRenderTypeState) =>
  getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.agentGenerated;

export type JsonEditorValueParseResult =
  | { success: true; value: unknown }
  | { success: false; value: string };

/** 将 JSON Editor 文本转换为原生 JSON 值；输入中的半成品保留文本供表单继续编辑。 */
export const parseJsonEditorValue = (value: unknown): JsonEditorValueParseResult => {
  if (typeof value !== 'string') return { success: true, value };

  try {
    return { success: true, value: JSON.parse(value) };
  } catch {
    return { success: false, value };
  }
};

/** 将已持久化的 JSON Editor 值转换为编辑文本；历史字符串本身就是编辑文本。 */
export const formatJsonEditorValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  return JSON.stringify(value, null, 2) ?? '';
};

/**
 * 服务端 runtime schema 的安全边界：即使持久化数据被篡改，也只允许普通可生成字段进入模型 schema。
 */
export const canInputBeAgentGenerated = (
  input: Pick<FlowNodeInputItemType, 'key' | 'canAgentGenerated'> & {
    renderTypeList?: FlowNodeInputItemType['renderTypeList'];
  }
) => {
  if (input.canAgentGenerated === false) return false;
  if (input.key === NodeInputKeyEnum.systemInputConfig) return false;
  if (input.key === NodeInputKeyEnum.forbidStream) return false;
  if (!Array.isArray(input.renderTypeList)) return false;
  return !input.renderTypeList.some((type) => agentGeneratedDenyRenderTypes.has(type));
};

/**
 * 归一当前节点输入的可选来源和默认选择。
 *
 * 所有支持 AI 生成的输入都会补充 agentGenerated；工具上下文才允许选中该类型，
 * 并在没有明确选择时按 isToolParam 应用默认值。
 */
export const normalizeFlowNodeInputType = <T extends CanonicalFlowNodeInputItem>(
  input: T,
  {
    isTool = false,
    forceDefaultMode = false,
    deferDefaultSelection = false
  }: NormalizeFlowNodeInputTypeOptions = {}
): T => {
  const inputRenderTypeList = input.renderTypeList ?? [];
  const recommendsAgentGenerated =
    input.isToolParam === true ||
    (input.isToolParam !== false && isTool && input.key === NodeInputKeyEnum.userChatInput);
  const supportsAgentGenerated = canInputBeAgentGenerated(input);
  const canUseAgentGenerated = isTool && supportsAgentGenerated;
  const renderTypeList = Array.from(
    new Set([
      ...(supportsAgentGenerated ? [FlowNodeInputTypeEnum.agentGenerated] : []),
      ...inputRenderTypeList.filter(
        (type) => supportsAgentGenerated || type !== FlowNodeInputTypeEnum.agentGenerated
      )
    ])
  );

  const savedSelectedType = forceDefaultMode ? undefined : input.selectedType;
  const shouldDefaultToAgentGenerated = canUseAgentGenerated && recommendsAgentGenerated;
  const defaultManualType = renderTypeList.find(
    (type) => type !== FlowNodeInputTypeEnum.agentGenerated
  );
  const selectedType =
    deferDefaultSelection && recommendsAgentGenerated && !savedSelectedType
      ? undefined
      : savedSelectedType &&
          renderTypeList.includes(savedSelectedType) &&
          (isTool ||
            deferDefaultSelection ||
            savedSelectedType !== FlowNodeInputTypeEnum.agentGenerated)
        ? savedSelectedType
        : shouldDefaultToAgentGenerated
          ? FlowNodeInputTypeEnum.agentGenerated
          : defaultManualType;

  return {
    ...input,
    renderTypeList,
    selectedType
  } as T;
};

/**
 * 判断工具入参是否存在可供开发者配置的手动输入控件。
 * reference 只表示工作流连线方式，不属于 Agent 工具配置里的手动输入。
 */
export const canInputBeManuallyConfigured = (
  input: Pick<FlowNodeInputItemType, 'renderTypeList'>
) => input.renderTypeList.some((type) => manualInputRenderTypes.has(type));

/** 父级工作流或 Agent 只展示能够由 AI 生成或具有通用手动控件的工具参数。 */
export const canInputBeConfiguredAsToolParam = (
  input: Pick<FlowNodeInputItemType, 'key' | 'renderTypeList'>
) => canInputBeAgentGenerated(input) || canInputBeManuallyConfigured(input);

const shouldUseAgentGeneratedOnly = (
  input: Pick<FlowNodeInputItemType, 'key' | 'renderTypeList'>
) =>
  input.renderTypeList.length > 0 &&
  canInputBeAgentGenerated(input) &&
  !canInputBeManuallyConfigured(input);

const getManualRenderTypeCandidates = (renderTypeList: FlowNodeInputTypeEnum[] = []) =>
  renderTypeList.filter((type) => manualInputRenderTypes.has(type));

const getValueTypePreferredManualType = (input: ToolInputTypeState) => {
  switch (input.valueType) {
    case WorkflowIOValueTypeEnum.number:
      return FlowNodeInputTypeEnum.numberInput;
    case WorkflowIOValueTypeEnum.boolean:
      return FlowNodeInputTypeEnum.switch;
    case WorkflowIOValueTypeEnum.object:
    case WorkflowIOValueTypeEnum.arrayString:
    case WorkflowIOValueTypeEnum.arrayNumber:
    case WorkflowIOValueTypeEnum.arrayBoolean:
    case WorkflowIOValueTypeEnum.arrayObject:
    case WorkflowIOValueTypeEnum.arrayAny:
    case WorkflowIOValueTypeEnum.any:
      return FlowNodeInputTypeEnum.JSONEditor;
    case WorkflowIOValueTypeEnum.string:
    default:
      return FlowNodeInputTypeEnum.input;
  }
};

/**
 * Agent 生成只是输入来源，切回手动输入时需要恢复真实编辑控件。
 * JSON Schema 的 list 可能只是候选值；只有没有 valueType 对应主控件时才回退到 select/multipleSelect。
 * 没有手动候选时返回 undefined，调用方不能把它伪造成手动输入。
 */
export const getToolInputManualRenderType = (input: ToolInputTypeState) => {
  const candidates = getManualRenderTypeCandidates(input.renderTypeList);
  const selectedType = getSelectedInputRenderType(input);
  const preferredType = getValueTypePreferredManualType(input);
  const isGenericSelectedType =
    selectedType === FlowNodeInputTypeEnum.input || selectedType === FlowNodeInputTypeEnum.textarea;
  const isSelectSelectedType =
    selectedType === FlowNodeInputTypeEnum.select ||
    selectedType === FlowNodeInputTypeEnum.multipleSelect;
  const hasPreferredManualType = candidates.includes(preferredType);

  if (
    selectedType &&
    candidates.includes(selectedType) &&
    (!isGenericSelectedType || preferredType === FlowNodeInputTypeEnum.input) &&
    (!isSelectSelectedType || !hasPreferredManualType)
  ) {
    return selectedType;
  }

  const hasGenericManualInput =
    candidates.includes(FlowNodeInputTypeEnum.input) ||
    candidates.includes(FlowNodeInputTypeEnum.textarea);
  if (!candidates.length) return undefined;

  if (candidates.includes(preferredType)) {
    return preferredType;
  }

  if (
    input.valueType?.startsWith('array') &&
    candidates.includes(FlowNodeInputTypeEnum.multipleSelect)
  ) {
    return FlowNodeInputTypeEnum.multipleSelect;
  }

  if (hasGenericManualInput) {
    // string 类型的 input/textarea 都是合法手动控件，优先保留候选列表中的具体类型。
    return preferredType === FlowNodeInputTypeEnum.input
      ? candidates.includes(FlowNodeInputTypeEnum.input)
        ? FlowNodeInputTypeEnum.input
        : FlowNodeInputTypeEnum.textarea
      : preferredType;
  }

  return candidates[0];
};

/**
 * 构造工作流画布上的输入类型候选。
 * 工具模式只展示一个与 valueType 匹配的手动控件，避免多个底层控件显示成重复的“手动输入”。
 */
export const getToolInputDisplayRenderTypeList = ({
  input,
  showAgentGenerated
}: {
  input: FlowNodeInputItemType;
  showAgentGenerated: boolean;
}) => {
  if (!(showAgentGenerated && canInputBeAgentGenerated(input))) {
    return Array.from(
      new Set(input.renderTypeList.filter((type) => type !== FlowNodeInputTypeEnum.agentGenerated))
    );
  }

  const manualRenderType = getToolInputManualRenderType(input);

  return Array.from(
    new Set([
      FlowNodeInputTypeEnum.agentGenerated,
      ...(manualRenderType ? [manualRenderType] : []),
      ...input.renderTypeList.filter(
        (type) => type !== FlowNodeInputTypeEnum.agentGenerated && !manualInputRenderTypes.has(type)
      )
    ])
  );
};

/**
 * 将 Agent 专用的 key + mode 配置合并回最新工具定义。
 * 工具定义负责控件类型和推荐默认值，mode 只表达用户最终选择的输入来源；
 * legacyDefaultMode 仅用于恢复未保存 inputs 的历史工具行为。
 */
export const initAgentToolInputType = <T extends FlowNodeInputItemType>({
  input,
  mode
}: {
  input: T;
  mode?: AgentToolInputModeEnum;
}): T => {
  const inputWithoutSelection = {
    ...input,
    selectedType: undefined
  } as T;
  const shouldUseAgentGenerated = mode === AgentToolInputModeEnum.agentGenerated;

  if (shouldUseAgentGenerated && canInputBeAgentGenerated(inputWithoutSelection)) {
    const renderTypeList = inputWithoutSelection.renderTypeList.includes(
      FlowNodeInputTypeEnum.agentGenerated
    )
      ? inputWithoutSelection.renderTypeList
      : [FlowNodeInputTypeEnum.agentGenerated, ...inputWithoutSelection.renderTypeList];

    return {
      ...inputWithoutSelection,
      renderTypeList,
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    };
  }

  if (mode === AgentToolInputModeEnum.manual) {
    const manualType = getToolInputManualRenderType(inputWithoutSelection);
    if (manualType) {
      const renderTypeList = Array.from(
        new Set([
          ...(canInputBeAgentGenerated(inputWithoutSelection)
            ? [FlowNodeInputTypeEnum.agentGenerated]
            : []),
          ...(inputWithoutSelection.renderTypeList.includes(manualType)
            ? inputWithoutSelection.renderTypeList
            : [manualType, ...inputWithoutSelection.renderTypeList])
        ])
      );

      return {
        ...inputWithoutSelection,
        renderTypeList,
        selectedType: manualType
      };
    }
  }

  return initToolInputTypeByDefaultMode(inputWithoutSelection, {
    forceDefaultMode: true,
    allowUserChatInputAgentGenerated: true
  });
};

export const getAgentToolInputMode = (input: InputRenderTypeState) =>
  isAgentGeneratedToolInput(input)
    ? AgentToolInputModeEnum.agentGenerated
    : AgentToolInputModeEnum.manual;

/** 将应用内完整 NodeIO 工具投影为 Agent 持久化所需的稀疏配置。 */
export const serializeAgentTool = ({
  tool,
  maxHistories
}: {
  tool: SelectedToolItemType;
  maxHistories?: number;
}) => {
  const config = tool.inputs.reduce<Record<string, unknown>>((acc, input) => {
    if (input.key === NodeInputKeyEnum.forbidStream) return acc;
    if (
      maxHistories !== undefined &&
      tool.flowNodeType === FlowNodeTypeEnum.appModule &&
      input.key === NodeInputKeyEnum.history
    ) {
      acc[input.key] = maxHistories;
      return acc;
    }
    acc[input.key] = input.value;
    return acc;
  }, {});

  return {
    id: tool.pluginId ?? tool.id,
    version: tool.version,
    source: tool.source,
    toolConfig: tool.toolConfig,
    inputs: tool.inputs.filter(canInputBeAgentGenerated).map((input) => ({
      key: input.key,
      mode: getAgentToolInputMode(input)
    })),
    config: filterToolConfiguredParams({ params: config, inputs: tool.inputs })
  };
};

/**
 * 读取当前工具配置里的最终选择。
 */
export const getSavedToolInputSelectedType = ({
  savedInput,
  defaultInput,
  allowUserChatInputAgentGenerated = false
}: {
  savedInput?: SavedToolInputTypeState;
  defaultInput: ToolInputTypeState;
  allowUserChatInputAgentGenerated?: boolean;
}) => {
  if (!savedInput) return;
  if (
    (allowUserChatInputAgentGenerated || defaultInput.key !== NodeInputKeyEnum.userChatInput) &&
    shouldUseAgentGeneratedOnly(defaultInput)
  ) {
    return FlowNodeInputTypeEnum.agentGenerated;
  }
  return savedInput.selectedType;
};

/**
 * 删除工具定义携带的默认输入方式，避免把它当成用户在配置页的最终选择持久化。
 */
export const stripToolInputDefaultMode = <T extends FlowNodeInputItemType>(
  input: T
): Omit<T, 'defaultToAgentGenerated'> => {
  const inputWithoutDefaultMode = { ...input };
  delete inputWithoutDefaultMode.defaultToAgentGenerated;
  return inputWithoutDefaultMode;
};

/**
 * 从模型返回的参数中只保留当前协议允许 Agent 生成的字段。
 * 运行时必须以用户最终选择的 selectedType 为准，避免模型覆盖开发者手动配置的参数。
 */
export const filterAgentGeneratedToolParams = ({
  params = {},
  inputs,
  additionalAllowedKeys = []
}: {
  params?: Record<string, any>;
  inputs: (Pick<FlowNodeInputItemType, 'key'> & InputRenderTypeState)[];
  additionalAllowedKeys?: string[];
}) => {
  const allowedKeys = new Set(additionalAllowedKeys);

  inputs.forEach((input) => {
    if (isAgentGeneratedToolInput(input) && canInputBeAgentGenerated(input)) {
      allowedKeys.add(input.key);
    }
  });

  return Object.fromEntries(Object.entries(params).filter(([key]) => allowedKeys.has(key)));
};

/**
 * 从开发者配置中移除最终由 Agent 生成的参数。
 * 该过滤同时用于持久化和运行时，避免存量固定值在模型未返回可选参数时继续进入工具请求。
 */
export const filterToolConfiguredParams = ({
  params = {},
  inputs
}: {
  params?: Record<string, any>;
  inputs: (Pick<FlowNodeInputItemType, 'key'> & InputRenderTypeState)[];
}) => {
  const agentGeneratedKeys = new Set(
    inputs
      .filter((input) => isAgentGeneratedToolInput(input) && canInputBeAgentGenerated(input))
      .map((input) => input.key)
  );

  return Object.fromEntries(Object.entries(params).filter(([key]) => !agentGeneratedKeys.has(key)));
};

/**
 * 工具首次加入工作流/Agent 时，将默认输入方式固化为 selectedType。
 * defaultToAgentGenerated 只表达初始化默认输入方式；toolDescription 只作为模型参数描述。
 */
export const initToolInputTypeByDefaultMode = <T extends FlowNodeInputItemType>(
  input: T,
  {
    forceDefaultMode = false,
    allowUserChatInputAgentGenerated = false
  }: ToolInputDefaultModeOptions = {}
): T => {
  const isTool = allowUserChatInputAgentGenerated || input.key !== NodeInputKeyEnum.userChatInput;
  const normalizedInput = normalizeFlowNodeInputType(input, { isTool, forceDefaultMode });

  // Agent 配置不展示 reference 等工作流专用类型；没有手动控件时只能由 Agent 生成。
  if (isTool && shouldUseAgentGeneratedOnly(normalizedInput)) {
    return {
      ...normalizedInput,
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    };
  }

  return normalizedInput;
};

export const initToolInputsTypeByDefaultMode = <T extends FlowNodeInputItemType>(
  inputs: T[],
  options?: ToolInputDefaultModeOptions
): T[] => inputs.map((input) => initToolInputTypeByDefaultMode(input, options));

/**
 * 判断开发者手动配置的工具入参是否已有有效值。
 * 节点上未显式覆盖时，工作流/工作流工具会在运行时使用 defaultValue，
 * 因而默认值同样满足工具配置校验。
 * 这里和 Agent 工具配置弹窗共用同一套判定，避免 required 字段被弹窗放行后又显示为未配置。
 */
export const isToolInputValueConfigured = ({
  input,
  value = input.value
}: {
  input: Pick<FlowNodeInputItemType, 'renderTypeList' | 'value' | 'defaultValue'>;
  value?: FlowNodeInputItemType['value'];
}) => {
  const configuredValue = value ?? input.defaultValue;
  if (configuredValue === undefined || configuredValue === null || configuredValue === '') {
    return false;
  }

  if (input.renderTypeList.includes(FlowNodeInputTypeEnum.timeRangeSelect)) {
    return Array.isArray(configuredValue) && !!configuredValue[0] && !!configuredValue[1];
  }

  if (Array.isArray(configuredValue) && configuredValue.length === 0) return false;
  if (typeof configuredValue === 'object' && Object.keys(configuredValue).length === 0) {
    return false;
  }
  return true;
};

/**
 * 校验工具是否能够加入应用级工具列表。
 * 应用级工具无法渲染模型、知识库等特殊输入；普通工作流工具节点由画布渲染这些输入。
 */
export const validateToolConfiguration = ({
  toolTemplate,
  canUploadFile,
  isAppTool = false
}: {
  toolTemplate: Pick<FlowNodeTemplateType, 'flowNodeType' | 'inputs'>;
  canUploadFile?: boolean;
  isAppTool?: boolean;
}): boolean => {
  // 检查文件上传配置
  const oneFileInput =
    toolTemplate.inputs.filter((input) =>
      input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
    ).length === 1;

  const hasValidFileInput = oneFileInput && !!canUploadFile;

  // 检查是否有无效的输入配置
  const hasInvalidInput = toolTemplate.inputs.some((input) => {
    if (isAgentGeneratedToolInput(input)) {
      return !canInputBeAgentGenerated(input);
    }

    // 引用类型但没有工具描述
    if (
      input.renderTypeList.length === 1 &&
      input.renderTypeList[0] === FlowNodeInputTypeEnum.reference &&
      !input.toolDescription
    ) {
      return true;
    }

    // 文件选择但配置无效
    if (
      isAppTool &&
      input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) &&
      !hasValidFileInput
    ) {
      return true;
    }

    // 包含特殊输入类型
    if (
      isAppTool &&
      input.renderTypeList.some((type) => unsupportedToolInputRenderTypes.has(type))
    ) {
      return true;
    }
    return false;
  });

  if (hasInvalidInput) {
    return false;
  }

  return true;
};

export const checkNeedsUserConfiguration = (toolTemplate: {
  inputs: FlowNodeTemplateType['inputs'];
}): boolean => {
  return (
    (toolTemplate.inputs.length > 0 &&
      toolTemplate.inputs.some((input) => {
        const normalizedInput = initToolInputTypeByDefaultMode(input, {
          allowUserChatInputAgentGenerated: true
        });
        // Agent 生成字段不需要开发者配置
        if (isAgentGeneratedToolInput(normalizedInput) && canInputBeAgentGenerated(normalizedInput))
          return false;
        // 禁用流的不需要配置
        if (input.key === NodeInputKeyEnum.forbidStream) return false;
        // 历史记录不需要配置
        if (input.key === NodeInputKeyEnum.history) return false;
        // 系统输入配置需要配置
        if (input.key === NodeInputKeyEnum.systemInputConfig) return true;
        if (!canInputBeConfiguredAsToolParam(normalizedInput)) return false;

        // 检查是否包含表单类型的输入
        return normalizedInput.renderTypeList.some((type) => formRenderTypesMap[type]);
      })) ||
    false
  );
};

/**
 * Get the configuration status of a tool
 * Checks if tool needs configuration and whether all required fields are filled
 * @param tool - The tool template to check
 * @returns 'active' if tool is ready to use, 'waitingForConfig' if configuration needed
 */
export const getToolConfigStatus = ({
  tool
}: {
  tool: {
    inputs: FlowNodeTemplateType['inputs'];
  };
}): {
  needConfig: boolean;
  status: SelectedToolItemType['configStatus'];
} => {
  // Check if tool needs configuration
  const needsConfig = checkNeedsUserConfiguration(tool);
  if (!needsConfig) {
    return {
      needConfig: false,
      status: 'noConfig'
    };
  }

  // Find all inputs that need configuration(Only check the required items)
  const configInputs = tool.inputs.filter((input) => {
    const normalizedInput = initToolInputTypeByDefaultMode(input, {
      allowUserChatInputAgentGenerated: true
    });
    if (input.key === NodeInputKeyEnum.forbidStream) return false;
    if (input.key === NodeInputKeyEnum.history) return false;
    if (input.key === NodeInputKeyEnum.systemInputConfig) return true;
    if (!canInputBeConfiguredAsToolParam(normalizedInput)) return false;
    if (isAgentGeneratedToolInput(normalizedInput) && canInputBeAgentGenerated(normalizedInput))
      return false;
    if (input.required !== true) return false;
    return normalizedInput.renderTypeList.some((type) => formRenderTypesMap[type]);
  });

  // Check if all required fields are filled
  const allConfigured = configInputs.every((input) => {
    return isToolInputValueConfigured({ input });
  });

  return {
    needConfig: !allConfigured,
    status: allConfigured ? 'configured' : 'waitingForConfig'
  };
};
