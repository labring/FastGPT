import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '../../workflow/constants';
import { FlowNodeInputTypeEnum } from '../../workflow/node/constant';
import type { FlowNodeTemplateType } from '../../workflow/type/node';
import type { SelectedToolItemType } from './type';

/* Invalid tool check
  1. Reference type. but not tool description;
  2. Has dataset select
  3. Has dynamic external data
*/
export const validateToolConfiguration = ({
  toolTemplate,
  canSelectFile,
  canSelectImg
}: {
  toolTemplate: FlowNodeTemplateType;
  canSelectFile?: boolean;
  canSelectImg?: boolean;
}): boolean => {
  // 检查文件上传配置
  const oneFileInput =
    toolTemplate.inputs.filter((input) =>
      input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
    ).length === 1;

  const canUploadFile = canSelectFile || canSelectImg;
  const hasValidFileInput = oneFileInput && !!canUploadFile;

  // 检查是否有无效的输入配置
  const hasInvalidInput = toolTemplate.inputs.some((input) => {
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

export const checkNeedsUserConfiguration = (toolTemplate: FlowNodeTemplateType): boolean => {
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
  return (
    (toolTemplate.inputs.length > 0 &&
      toolTemplate.inputs.some((input) => {
        // 有工具描述的不需要配置
        if (input.toolDescription) return false;
        // 禁用流的不需要配置
        if (input.key === NodeInputKeyEnum.forbidStream) return false;
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
  tool: FlowNodeTemplateType;
}): {
  needConfig: boolean;
  status: SelectedToolItemType['configStatus'];
} => {
  // Check if tool needs configuration
  const needsConfig = checkNeedsUserConfiguration(tool);
  if (!needsConfig) {
    return {
      needConfig: false,
      status: 'unconfigured'
    };
  }

  // For tools that need config, check if all required fields have values
  const formRenderTypesMap: Record<string, boolean> = {
    [FlowNodeInputTypeEnum.input]: true,
    [FlowNodeInputTypeEnum.textarea]: true,
    [FlowNodeInputTypeEnum.numberInput]: true,
    [FlowNodeInputTypeEnum.password]: true,
    [FlowNodeInputTypeEnum.select]: true,
    [FlowNodeInputTypeEnum.JSONEditor]: true,
    [FlowNodeInputTypeEnum.timePointSelect]: true,
    [FlowNodeInputTypeEnum.timeRangeSelect]: true
  };

  // Find all inputs that need configuration(Only check the required items)
  const configInputs = tool.inputs.filter((input) => {
    if (input.key === NodeInputKeyEnum.forbidStream) return false;
    if (input.key === NodeInputKeyEnum.history) return false;
    if (input.key === NodeInputKeyEnum.systemInputConfig) return true;
    if (input.toolDescription || input.required !== true) return false;
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
