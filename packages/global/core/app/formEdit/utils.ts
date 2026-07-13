import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '../../workflow/constants';
import { FlowNodeInputTypeEnum } from '../../workflow/node/constant';
import type { FlowNodeInputItemType } from '../../workflow/type/io';
import type { FlowNodeTemplateType } from '../../workflow/type/node';
import { getSelectedInputRenderType } from '../../workflow/utils';
import type { SelectedToolItemType } from './type';

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
  FlowNodeInputTypeEnum.selectDataset,
  FlowNodeInputTypeEnum.selectDatasetParamsModal,
  FlowNodeInputTypeEnum.settingDatasetQuotePrompt
]);

type InputRenderTypeState = {
  renderTypeList?: FlowNodeInputItemType['renderTypeList'];
  selectedType?: FlowNodeInputItemType['selectedType'];
  selectedTypeIndex?: FlowNodeInputItemType['selectedTypeIndex'];
};

type ToolInputTypeState = InputRenderTypeState &
  Pick<Partial<FlowNodeInputItemType>, 'isToolParam' | 'list' | 'enums' | 'enum' | 'valueType'>;

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

/**
 * 服务端 runtime schema 的安全边界：即使持久化数据被篡改，也只允许普通可生成字段进入模型 schema。
 */
export const canInputBeAgentGenerated = (
  input: Pick<FlowNodeInputItemType, 'key'> & {
    renderTypeList?: FlowNodeInputItemType['renderTypeList'];
  }
) => {
  if (input.key === NodeInputKeyEnum.systemInputConfig) return false;
  if (!Array.isArray(input.renderTypeList)) return false;
  return !input.renderTypeList.some((type) => agentGeneratedDenyRenderTypes.has(type));
};

const getManualRenderTypeCandidates = (renderTypeList: FlowNodeInputTypeEnum[] = []) =>
  renderTypeList.filter((type) => manualInputRenderTypes.has(type));

const hasSelectOptions = (input: ToolInputTypeState) =>
  !!input.list?.length || !!input.enums?.length || !!input.enum?.trim();

const getValueTypePreferredManualType = (input: ToolInputTypeState) => {
  if (hasSelectOptions(input)) {
    return input.valueType && input.valueType.startsWith('array')
      ? FlowNodeInputTypeEnum.multipleSelect
      : FlowNodeInputTypeEnum.select;
  }

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
 * 旧数据可能只剩 agentGenerated/input，这里按 valueType 和选项信息兜底恢复 number/select 等类型。
 */
export const getToolInputManualRenderType = (input: ToolInputTypeState) => {
  const candidates = getManualRenderTypeCandidates(input.renderTypeList);
  const selectedType = getSelectedInputRenderType(input);
  const preferredType = getValueTypePreferredManualType(input);
  const isGenericSelectedType =
    selectedType === FlowNodeInputTypeEnum.input || selectedType === FlowNodeInputTypeEnum.textarea;

  if (
    selectedType &&
    candidates.includes(selectedType) &&
    !(isGenericSelectedType && preferredType !== FlowNodeInputTypeEnum.input)
  ) {
    return selectedType;
  }

  const hasGenericManualInput =
    candidates.includes(FlowNodeInputTypeEnum.input) ||
    candidates.includes(FlowNodeInputTypeEnum.textarea);
  if (candidates.includes(preferredType) || hasGenericManualInput || candidates.length === 0) {
    return preferredType;
  }

  return candidates[0] ?? FlowNodeInputTypeEnum.input;
};

/**
 * 读取旧工具配置里的最终选择。
 * 旧协议常带 selectedTypeIndex: 0；当旧列表没有 agentGenerated 且新版 schema 标记 isToolParam
 * 时，0 只代表旧默认项，不代表用户明确选择了手动输入。
 */
export const getSavedToolInputSelectedType = ({
  savedInput,
  defaultInput
}: {
  savedInput?: InputRenderTypeState;
  defaultInput: ToolInputTypeState;
}) => {
  if (!savedInput) return;
  if (savedInput.selectedType) return savedInput.selectedType;
  if (savedInput.selectedTypeIndex === undefined) return;

  const selectedType = getSelectedInputRenderType(savedInput);
  const isLegacyDefaultManualType =
    defaultInput.isToolParam === true &&
    savedInput.selectedTypeIndex === 0 &&
    !savedInput.renderTypeList?.includes(FlowNodeInputTypeEnum.agentGenerated) &&
    selectedType !== FlowNodeInputTypeEnum.reference;

  return isLegacyDefaultManualType ? undefined : selectedType;
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
 * 工具首次加入工作流/Agent 时，将默认输入方式固化为 selectedType。
 * isToolParam 是插件/schema 声明的默认输入方式；toolDescription 只作为模型参数描述。
 */
export const initToolInputTypeByDefaultMode = <T extends FlowNodeInputItemType>(input: T): T => {
  const selectedType = getSelectedInputRenderType(input);
  const hasSelectedType = input.selectedType !== undefined || input.selectedTypeIndex !== undefined;
  const inputWithSelectedType = (
    hasSelectedType && selectedType
      ? {
          ...input,
          selectedType,
          selectedTypeIndex: input.renderTypeList.includes(selectedType)
            ? input.renderTypeList.findIndex((type) => type === selectedType)
            : undefined
        }
      : input
  ) as T;

  if (hasSelectedType) return inputWithSelectedType;
  if (isAgentGeneratedToolInput(inputWithSelectedType)) return inputWithSelectedType;

  if (
    inputWithSelectedType.isToolParam !== true ||
    !canInputBeAgentGenerated(inputWithSelectedType)
  ) {
    return inputWithSelectedType;
  }

  const renderTypeList = input.renderTypeList.includes(FlowNodeInputTypeEnum.agentGenerated)
    ? input.renderTypeList
    : [
        FlowNodeInputTypeEnum.agentGenerated,
        ...input.renderTypeList.filter((type) => type !== FlowNodeInputTypeEnum.agentGenerated)
      ];
  const selectedTypeIndex = renderTypeList.findIndex(
    (type) => type === FlowNodeInputTypeEnum.agentGenerated
  );

  return {
    ...inputWithSelectedType,
    selectedType: FlowNodeInputTypeEnum.agentGenerated,
    selectedTypeIndex: selectedTypeIndex >= 0 ? selectedTypeIndex : 0,
    renderTypeList
  };
};

export const initToolInputsTypeByDefaultMode = <T extends FlowNodeInputItemType>(
  inputs: T[]
): T[] => inputs.map((input) => initToolInputTypeByDefaultMode(input));

/**
 * 判断开发者手动配置的工具入参是否已有有效值。
 * 这里和 Agent 工具配置弹窗共用同一套判定，避免 required 字段被弹窗放行后又显示为未配置。
 */
export const isToolInputValueConfigured = ({
  input,
  value = input.value
}: {
  input: Pick<FlowNodeInputItemType, 'renderTypeList' | 'value'>;
  value?: FlowNodeInputItemType['value'];
}) => {
  if (value === undefined || value === null || value === '') return false;

  if (input.renderTypeList.includes(FlowNodeInputTypeEnum.timeRangeSelect)) {
    return Array.isArray(value) && !!value[0] && !!value[1];
  }

  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'object' && Object.keys(value).length === 0) return false;
  return true;
};

/* Invalid tool check
  1. Reference type. but not tool description;
  2. Has dataset select
  3. Has dynamic external data
*/
export const validateToolConfiguration = ({
  toolTemplate,
  canUploadFile
}: {
  toolTemplate: FlowNodeTemplateType;
  canUploadFile?: boolean;
}): boolean => {
  // 检查文件上传配置
  const oneFileInput =
    toolTemplate.inputs.filter((input) =>
      input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
    ).length === 1;

  const hasValidFileInput = oneFileInput && !!canUploadFile;

  // 检查是否有无效的输入配置
  const hasInvalidInput = toolTemplate.inputs.some((input) => {
    if (isAgentGeneratedToolInput(input) && canInputBeAgentGenerated(input)) return false;

    // 引用类型但没有工具描述
    if (
      input.renderTypeList.length === 1 &&
      input.renderTypeList[0] === FlowNodeInputTypeEnum.reference &&
      !input.toolDescription
    ) {
      return true;
    }

    // 文件选择但配置无效
    if (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) && !hasValidFileInput) {
      return true;
    }

    // 包含特殊输入类型
    const list = [
      FlowNodeInputTypeEnum.selectDataset,
      FlowNodeInputTypeEnum.addInputParam,
      FlowNodeInputTypeEnum.selectLLMModel,
      FlowNodeInputTypeEnum.settingLLMModel,
      FlowNodeInputTypeEnum.fileSelect
    ];

    if (list.some((type) => input.renderTypeList.includes(type))) {
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
        const normalizedInput = initToolInputTypeByDefaultMode(input);
        // Agent 生成字段不需要开发者配置
        if (isAgentGeneratedToolInput(normalizedInput) && canInputBeAgentGenerated(normalizedInput))
          return false;
        // 禁用流的不需要配置
        if (input.key === NodeInputKeyEnum.forbidStream) return false;
        // 历史记录不需要配置
        if (input.key === NodeInputKeyEnum.history) return false;
        // 系统输入配置需要配置
        if (input.key === NodeInputKeyEnum.systemInputConfig) return true;

        // 检查是否包含表单类型的输入
        return input.renderTypeList.some((type) => formRenderTypesMap[type]);
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
    const normalizedInput = initToolInputTypeByDefaultMode(input);
    if (input.key === NodeInputKeyEnum.forbidStream) return false;
    if (input.key === NodeInputKeyEnum.history) return false;
    if (input.key === NodeInputKeyEnum.systemInputConfig) return true;
    if (isAgentGeneratedToolInput(normalizedInput) && canInputBeAgentGenerated(normalizedInput))
      return false;
    if (input.required !== true) return false;
    return input.renderTypeList.some((type) => formRenderTypesMap[type]);
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
