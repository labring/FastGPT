import { useModelDetail } from '@/web/core/ai/model/useModelDetail';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { useMemo } from 'react';
import { useNodeValue } from '@/web/core/workflow/editor/react/useNode';

const EMPTY_INVALID_OUTPUT_KEYS = new Set<string>();

/** 根据当前模型详情计算编辑器层的不可用输出，不修改 Runtime Document。 */
export const getInvalidOutputKeys = ({
  inputs,
  outputs,
  llmModelMap
}: {
  inputs: FlowNodeInputItemType[];
  outputs: readonly FlowNodeOutputItemType[];
  llmModelMap: Record<string, Pick<LLMSystemModelDataType, 'model' | 'modelId' | 'config'>>;
}) => {
  const invalidOutputKeys = new Set(
    outputs.filter((output) => output.invalid === true).map((output) => output.key)
  );

  outputs.forEach((output) => {
    if (!output.invalidCondition) return;
    if (
      output.invalidCondition({
        inputs,
        llmModelMap
      })
    ) {
      invalidOutputKeys.add(output.key);
    } else {
      invalidOutputKeys.delete(output.key);
    }
  });

  return invalidOutputKeys;
};

/**
 * 按当前模型能力计算节点输出的 `invalid` 派生标记，结果只作为编辑器视图状态返回。
 *
 * `invalid` 不属于工作流语义，不能写入 Runtime Document、History、Savepoint 或保存数据。
 * 模型详情加载/失败时保留模板或已有视图默认值，等待下一次详情成功后重新计算。
 *
 * 读取基准是节点 scoped snapshot，普通字段变化只刷新使用该 hook 的 renderer。
 */
export const useNodeOutputValidity = (nodeId: string) => {
  const inputs = useNodeValue(nodeId, (node) => node?.data.inputs);
  const outputs = useNodeValue(nodeId, (node) => node?.data.outputs);
  const needsModel = outputs?.some((output) => !!output.invalidCondition);
  const { model, loading, error } = useModelDetail({
    modelType: ModelTypeEnum.llm,
    modelId: needsModel
      ? inputs?.find((input) => input.key === NodeInputKeyEnum.aiModelId)?.value
      : undefined,
    model: needsModel
      ? inputs?.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value
      : undefined
  });

  return useMemo(() => {
    if (!outputs) return EMPTY_INVALID_OUTPUT_KEYS;

    const llmModelMap = model ? { [model.modelId]: model, [model.model]: model } : {};
    if (!inputs || !needsModel || loading || error) {
      return new Set(
        outputs.filter((output) => output.invalid === true).map((output) => output.key)
      );
    }

    return getInvalidOutputKeys({
      inputs: inputs as FlowNodeInputItemType[],
      outputs: outputs as unknown as FlowNodeOutputItemType[],
      llmModelMap
    });
  }, [error, inputs, loading, model, needsModel, outputs]);
};
