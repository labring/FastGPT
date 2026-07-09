import { NodeInputKeyEnum } from '../../workflow/constants';
import { FlowNodeInputTypeEnum } from '../../workflow/node/constant';
import type { FlowNodeInputItemType } from '../../workflow/type/io';
import type { FlowNodeTemplateType } from '../../workflow/type/node';
import type { SelectedToolItemType } from './type';

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
  selectedTypeIndex?: FlowNodeInputItemType['selectedTypeIndex'];
};

/**
 * 获取输入当前选中的渲染类型。
 * renderTypeList 表示可选类型，selectedTypeIndex 表示当前选择；历史数据缺少 index 时回退到第 0 项。
 */
export const getSelectedInputRenderType = (input: InputRenderTypeState) =>
  input.renderTypeList?.[input.selectedTypeIndex ?? 0];

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

/**
 * 从模型返回的参数中只保留当前协议允许 Agent 生成的字段。
 * 运行时必须以用户最终选择的 selectedTypeIndex 为准，避免模型覆盖开发者手动配置的参数。
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
 * 工具首次加入工作流/Agent 时，将默认输入方式固化为 selectedTypeIndex。
 * isToolParam 是插件/schema 声明的默认输入方式；toolDescription 只作为模型参数描述。
 */
export const initToolInputTypeByDefaultMode = <T extends FlowNodeInputItemType>(input: T): T => {
  if (isAgentGeneratedToolInput(input)) return input;

  if (
    input.isToolParam !== true ||
    !canInputBeAgentGenerated(input) ||
    input.renderTypeList.includes(FlowNodeInputTypeEnum.agentGenerated)
  ) {
    return input;
  }

  return {
    ...input,
    selectedTypeIndex: 0,
    renderTypeList: [
      FlowNodeInputTypeEnum.agentGenerated,
      ...input.renderTypeList.filter((type) => type !== FlowNodeInputTypeEnum.agentGenerated)
    ]
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
