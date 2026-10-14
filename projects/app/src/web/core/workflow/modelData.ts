import { getUserModelSummaries } from '@/web/core/ai/model/catalogApi';
import {
  getModelDetail,
  getModelReadIdentity,
  matchesModelFilter,
  peekModelCatalog
} from '@/web/core/ai/model/modelData';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import {
  getSelectedInputRenderType,
  isWorkflowSystemModelInput,
  workflowModelKeyMappings
} from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';

/**
 * 同步读取当前团队可用的模型目录，作为 Runtime 的环境事实（getEnvironment 必须同步）。
 * 目录未就绪返回 undefined，与“目录为空”区分开：调用方据此跳过本轮模型规则，
 * 目录就绪后由 host 触发一次 Issue 刷新补上结果。
 */
export const peekWorkflowEnvironmentModels = () => {
  const catalog = peekModelCatalog();
  if (!catalog) return undefined;
  // 与 peekModelDetail 共用同一份过滤规则，避免可选列表和可用性校验出现两套口径。
  return catalog.modelList
    .filter((model) => matchesModelFilter(model, {}))
    .map((model) => ({
      modelId: model.modelId,
      model: model.model,
      type: model.type,
      config: model.config
    }));
};

type WorkflowModelNode =
  | Pick<StoreNodeItemType, 'flowNodeType' | 'inputs'>
  | { data: Pick<FlowNodeItemType, 'flowNodeType' | 'inputs'> }
  | DeepReadonly<Pick<StoreNodeItemType, 'flowNodeType' | 'inputs'>>
  | { data: DeepReadonly<Pick<FlowNodeItemType, 'flowNodeType' | 'inputs'>> };

const getWorkflowModelNodeData = (node: WorkflowModelNode) =>
  ('data' in node ? node.data : node) as Pick<FlowNodeItemType, 'flowNodeType' | 'inputs'>;

/**
 * 按实际引用读取模型校验信息。个人目录之外的模型通过应用草稿基线确认可用性，
 * 与知识库、工具的已有资源规则一致；摘要只用于当前校验，不能写入个人候选目录。
 */
export const getWorkflowModelDetails = async ({
  nodes,
  chatConfig,
  appId
}: {
  nodes: readonly WorkflowModelNode[];
  chatConfig?: AppChatConfigType | DeepReadonly<AppChatConfigType>;
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

  for (const node of nodes) {
    const data = getWorkflowModelNodeData(node);
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
      const params = datasetParams as Record<string, unknown> | undefined;
      add(
        params?.[NodeInputKeyEnum.datasetSearchRerankModelId],
        params?.[NodeInputKeyEnum.datasetSearchRerankModel]
      );
      add(
        params?.[NodeInputKeyEnum.datasetSearchExtensionModelId],
        params?.[NodeInputKeyEnum.datasetSearchExtensionModel]
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
      if (detail || !reference.modelId || !legacySelectorValues.has(reference.modelId)) {
        return detail;
      }
      return getModelDetail({ model: reference.modelId });
    })
  );
  const models: (Pick<MyModelItemType, 'modelId' | 'type'> & { model?: string })[] = details.filter(
    (model): model is NonNullable<typeof model> => model !== undefined
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
