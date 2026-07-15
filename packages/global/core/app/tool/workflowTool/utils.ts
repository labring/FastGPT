import type { FlowNodeInputItemType } from '../../../workflow/type/io';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../workflow/node/constant';
import { type StoreNodeItemType } from '../../../workflow/type/node';

/** 系统工具关联的工作流暂不支持这些需要 FastGPT 运行时上下文的输入类型。 */
export const workflowToolUnsupportedInputTypes = new Set<FlowNodeInputTypeEnum>([
  FlowNodeInputTypeEnum.fileSelect,
  FlowNodeInputTypeEnum.selectDataset,
  FlowNodeInputTypeEnum.selectLLMModel,
  FlowNodeInputTypeEnum.addInputParam
]);

export const getWorkflowToolInputsFromStoreNodes = (nodes: StoreNodeItemType[]) => {
  return nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs || [];
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
