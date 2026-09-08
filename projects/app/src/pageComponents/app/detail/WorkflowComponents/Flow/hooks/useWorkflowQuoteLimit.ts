import { getModelDetail } from '@/web/core/ai/model/modelData';
import {
  getModelQuoteTokenLimit,
  UNAVAILABLE_MODEL_TOKEN_LIMIT
} from '@/web/core/ai/model/selection';
import { useModelQuery } from '@/web/core/ai/model/useModelQuery';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useCallback } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowInitContext } from '../../context/workflowInitContext';

/** 引用额度消费者按当前工作流实际引用读取详情；Context 只提供节点，不加载或下发模型数据。 */
export const useWorkflowQuoteLimit = () => {
  const referenceKey = useContextSelector(WorkflowInitContext, (state) =>
    JSON.stringify(
      state.nodes
        .filter(
          (node) =>
            node.data.flowNodeType === FlowNodeTypeEnum.chatNode ||
            node.data.flowNodeType === FlowNodeTypeEnum.agent
        )
        .map((node) => ({
          modelId: node.data.inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId)
            ?.value,
          model: node.data.inputs.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value
        }))
    )
  );
  const read = useCallback(async () => {
    const references: { modelId?: string; model?: string }[] = JSON.parse(referenceKey);
    const models = await Promise.all(
      references.map((reference) => getModelDetail({ ...reference, modelType: ModelTypeEnum.llm }))
    );
    return models.length
      ? Math.max(...models.map(getModelQuoteTokenLimit))
      : UNAVAILABLE_MODEL_TOKEN_LIMIT;
  }, [referenceKey]);
  const state = useModelQuery({ queryKey: referenceKey, read });
  return state.data ?? UNAVAILABLE_MODEL_TOKEN_LIMIT;
};
