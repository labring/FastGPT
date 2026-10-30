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
import { useWorkflowSnapshot } from '@/web/core/workflow/editor/session/workflowSession';

/**
 * 引用额度消费者按当前工作流实际引用读取详情；只从文档挑出「会引用知识库的节点所用模型」，
 * 不加载或下发模型数据。
 *
 * 选择器返回 JSON 字符串：host 每次 runtime 事件都会换 context 值身份，选择器随之重跑，
 * 但只有模型引用集合真变了才让消费节点重渲染（旧实现按画布数组选择，语义一致）。
 */
export const useWorkflowQuoteLimit = () => {
  const referenceKey = JSON.stringify(
    (useWorkflowSnapshot()?.nodes ?? [])
      .filter(
        (node) =>
          node.flowNodeType === FlowNodeTypeEnum.chatNode ||
          node.flowNodeType === FlowNodeTypeEnum.agent
      )
      .map((node) => ({
        modelId: node.inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId)?.value,
        model: node.inputs.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value
      }))
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
