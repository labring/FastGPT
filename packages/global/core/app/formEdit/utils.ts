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

/**
 * 判断工具入参当前最终类型是否为 Agent 生成。
 * 默认输入方式会在 preview/detail 构建阶段写入 renderTypeList，这里只消费最终状态。
 */
export const isAgentGeneratedToolInput = (input: Pick<FlowNodeInputItemType, 'renderTypeList'>) =>
  input.renderTypeList[0] === FlowNodeInputTypeEnum.agentGenerated;

/**
 * 服务端 runtime schema 的安全边界：即使持久化数据被篡改，也只允许普通可生成字段进入模型 schema。
 */
export const canInputBeAgentGenerated = (
  input: Pick<FlowNodeInputItemType, 'key' | 'renderTypeList'>
) => {
  if (input.key === NodeInputKeyEnum.systemInputConfig) return false;
  return !input.renderTypeList.some((type) => agentGeneratedDenyRenderTypes.has(type));
};

/**
 * 工具首次加入工作流/Agent 时，将默认输入方式固化为最终 renderTypeList。
 * 未来插件侧 isToolParam 落地后，应在这里优先读取该字段；当前用 toolDescription 兼容旧插件。
 */
export const initToolInputTypeByDefaultMode = <T extends FlowNodeInputItemType>(input: T): T => {
  if (isAgentGeneratedToolInput(input)) return input;

  if (
    !input.toolDescription ||
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
    const value = input.value;
    if (value === undefined || value === null || value === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
    return true;
  });

  return {
    needConfig: !allConfigured,
    status: allConfigured ? 'configured' : 'waitingForConfig'
  };
};
