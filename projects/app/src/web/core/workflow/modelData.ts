import { getUserModelSummaries } from '@/web/core/ai/model/catalogApi';
import { getModelDetail, getModelReadIdentity } from '@/web/core/ai/model/modelData';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import {
  getSelectedInputRenderType,
  isWorkflowSystemModelInput,
  workflowModelKeyMappings
} from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';

/**
 * 按实际引用读取模型校验信息。个人目录之外的模型通过应用草稿基线确认可用性，
 * 与知识库、工具的已有资源规则一致；摘要只用于当前校验，不能写入个人候选目录。
 */
export const getWorkflowModelDetails = async ({
  nodes,
  chatConfig,
  appId
}: {
  nodes: { data: FlowNodeItemType }[];
  chatConfig?: AppChatConfigType;
  appId?: string;
}) => {
  const references = new Map<string, { modelId?: string; model?: string }>();
  const legacySelectorValues = new Set<string>();
  const add = (modelId: unknown, model: unknown) => {
    const value = getModelReferenceValue({ modelId, model });
    if (typeof value !== 'string' || isEmptyModelValue(value) || /^\{\{.*\}\}$/.test(value)) return;
    const reference = !isEmptyModelValue(modelId) ? { modelId: value } : { model: value };
    references.set(JSON.stringify(reference), reference);
  };
  for (const { data } of nodes) {
    for (const [legacyKey, modelIdKey] of workflowModelKeyMappings) {
      const canonical = data.inputs.find((input) => input.key === modelIdKey);
      const legacy = data.inputs.find((input) => input.key === legacyKey);
      const modelInput = canonical ?? legacy;
      if (!modelInput || !isWorkflowSystemModelInput({ node: data, input: modelInput })) continue;
      add(canonical?.value ?? canonical?.defaultValue, legacy?.value ?? legacy?.defaultValue);
    }
    for (const input of data.inputs) {
      if (
        !isWorkflowSystemModelInput({ node: data, input }) &&
        getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.selectLLMModel
      ) {
        const value = input.value ?? input.defaultValue;
        add(value, undefined);
        // 旧 WorkflowTool 自定义选择器允许名称默认值，兼容限定在此输入边界。
        if (typeof value === 'string') legacySelectorValues.add(value);
      }
    }

    // 仅 Agent 知识库参数内的重排、问题优化参与校验，工具业务数据与向量模型快照不属于此范围。
    if (data.flowNodeType === FlowNodeTypeEnum.agent) {
      const datasetParams = data.inputs.find(
        (input) => input.key === NodeInputKeyEnum.datasetParams
      )?.value;
      add(
        datasetParams?.[NodeInputKeyEnum.datasetSearchRerankModelId],
        datasetParams?.[NodeInputKeyEnum.datasetSearchRerankModel]
      );
      add(
        datasetParams?.[NodeInputKeyEnum.datasetSearchExtensionModelId],
        datasetParams?.[NodeInputKeyEnum.datasetSearchExtensionModel]
      );
    }
  }
  add(chatConfig?.questionGuide?.modelId, chatConfig?.questionGuide?.model);
  add(chatConfig?.ttsConfig?.modelId, chatConfig?.ttsConfig?.model);

  const identity = getModelReadIdentity()?.key;
  const refs = [...references.values()];
  const details = await Promise.all(
    refs.map(async (reference) => {
      const detail = await getModelDetail(reference);
      if (detail || !reference.modelId || !legacySelectorValues.has(reference.modelId))
        return detail;
      return getModelDetail({ model: reference.modelId });
    })
  );
  const models: (Pick<MyModelItemType, 'modelId' | 'type'> & { model?: string })[] = details.filter(
    (model) => model !== undefined
  );
  if (!appId) return models;

  // 只补查个人目录未命中的稳定 ID；服务端确认应用权限、基线与状态，校验器继续按真实类型检查。
  const missingIds = refs.flatMap((ref, index) =>
    !details[index] && ref.modelId ? [ref.modelId] : []
  );
  for (let offset = 0; offset < missingIds.length; offset += 100) {
    const { models: summaries } = await getUserModelSummaries({
      appId,
      modelIds: missingIds.slice(offset, offset + 100)
    });
    if (getModelReadIdentity()?.key !== identity) {
      throw new Error('Model viewer identity changed during loading');
    }
    for (const summary of summaries) {
      if (summary.status === 'active' && summary.type) {
        models.push({ modelId: summary.modelId, type: summary.type });
      }
    }
  }
  return models;
};
