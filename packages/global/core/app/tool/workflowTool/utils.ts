import type { FlowNodeInputItemType } from '../../../workflow/type/io';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../workflow/node/constant';
import { type StoreNodeItemType } from '../../../workflow/type/node';
import { canInputBeAgentGenerated } from '../../formEdit/utils';

/**
 * 系统工具关联的工作流暂不支持这些需要 FastGPT 运行时上下文的输入类型：
 * 文件、知识库、模型和外部动态输入。
 * hidden 是内部变量，schema 需要保留其元数据/默认值；对外入参会在工具边界过滤。
 */
export const workflowToolUnsupportedInputTypes = new Set<FlowNodeInputTypeEnum>([
  FlowNodeInputTypeEnum.fileSelect,
  FlowNodeInputTypeEnum.selectDataset,
  FlowNodeInputTypeEnum.selectDatasetParamsModal,
  FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
  FlowNodeInputTypeEnum.selectLLMModel,
  FlowNodeInputTypeEnum.settingLLMModel,
  FlowNodeInputTypeEnum.customVariable,
  FlowNodeInputTypeEnum.addInputParam
]);

/**
 * 兼容旧版工作流工具输入：旧协议通过 toolDescription 是否存在表示默认由 AI 生成。
 * 该归一化仅供工作流工具边界使用，显式 isToolParam 始终优先。
 */
export const normalizeWorkflowToolInputDefaultMode = <T extends FlowNodeInputItemType>(
  input: T
): T => {
  if (
    input.isToolParam !== undefined ||
    !input.toolDescription ||
    !canInputBeAgentGenerated(input)
  ) {
    return input;
  }

  return {
    ...input,
    isToolParam: true
  };
};

/** 批量归一化工作流工具输入的默认生成方式。 */
export const normalizeWorkflowToolInputsDefaultMode = <T extends FlowNodeInputItemType>(
  inputs: T[]
): T[] => inputs.map(normalizeWorkflowToolInputDefaultMode);

export const getWorkflowToolInputsFromStoreNodes = (nodes: StoreNodeItemType[]) => {
  return (
    nodes
      .find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)
      ?.inputs.filter((input) => !input.renderTypeList?.includes(FlowNodeInputTypeEnum.hidden)) ||
    []
  );
};

/** 只保留工作流工具允许从外部传入的入参，内部 hidden 变量由节点默认值负责初始化。 */
export const filterWorkflowToolInputVariables = ({
  inputs,
  variables
}: {
  inputs: Pick<FlowNodeInputItemType, 'key' | 'renderTypeList'>[];
  variables: Record<string, any>;
}) => {
  const inputKeys = new Set(
    inputs
      .filter((input) => !input.renderTypeList.includes(FlowNodeInputTypeEnum.hidden))
      .map((input) => input.key)
  );

  return Object.fromEntries(Object.entries(variables).filter(([key]) => inputKeys.has(key)));
};

/** 返回工作流工具入参中需要拒绝系统工具关联的特殊输入类型。 */
export const getWorkflowToolUnsupportedInputTypes = (
  inputs: Pick<FlowNodeInputItemType, 'renderTypeList'>[]
) =>
  Array.from(
    new Set(
      inputs.flatMap((input) =>
        input.renderTypeList.filter((type) => workflowToolUnsupportedInputTypes.has(type))
      )
    )
  );
