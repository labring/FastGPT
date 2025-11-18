import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

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
  const hasInvalidInput = toolTemplate.inputs.some(
    (input) =>
      // 引用类型但没有工具描述
      (input.renderTypeList.length === 1 &&
        input.renderTypeList[0] === FlowNodeInputTypeEnum.reference &&
        !input.toolDescription) ||
      // 包含数据集选择
      input.renderTypeList.includes(FlowNodeInputTypeEnum.selectDataset) ||
      // 包含动态输入参数
      input.renderTypeList.includes(FlowNodeInputTypeEnum.addInputParam) ||
      // 文件选择但配置无效
      (input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect) && !hasValidFileInput)
  );

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
    toolTemplate.inputs.length > 0 &&
    toolTemplate.inputs.some((input) => {
      // 有工具描述的不需要配置
      if (input.toolDescription) return false;
      // 禁用流的不需要配置
      if (input.key === NodeInputKeyEnum.forbidStream) return false;
      // 系统输入配置需要配置
      if (input.key === NodeInputKeyEnum.systemInputConfig) return true;

      // 检查是否包含表单类型的输入
      return input.renderTypeList.some((type) => formRenderTypesMap[type]);
    })
  );
};
