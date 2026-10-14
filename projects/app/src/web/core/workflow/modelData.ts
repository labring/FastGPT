import { getUserModelSummaries } from '@/web/core/ai/model/catalogApi';
import {
  getModelDefault,
  getModelDetail,
  getModelReadIdentity
} from '@/web/core/ai/model/modelData';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import {
  getSelectedInputRenderType,
  isWorkflowSystemModelInput,
  workflowDatasetParamModelSlots,
  workflowSystemModelSlots
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
    for (const { legacyKey, modelIdKey } of workflowSystemModelSlots) {
      const canonicalInputs = data.inputs.filter(
        (input) => input.key === modelIdKey && isWorkflowSystemModelInput({ node: data, input })
      );
      const legacyInputs = data.inputs.filter(
        (input) => input.key === legacyKey && isWorkflowSystemModelInput({ node: data, input })
      );
      if (canonicalInputs.length > 0) {
        const fallbackLegacyValue = legacyInputs[0]?.value ?? legacyInputs[0]?.defaultValue;
        for (const canonical of canonicalInputs) {
          add(canonical.value ?? canonical.defaultValue, fallbackLegacyValue);
        }
      } else {
        for (const legacy of legacyInputs) {
          add(undefined, legacy.value ?? legacy.defaultValue);
        }
      }
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
      for (const { legacyKey, modelIdKey } of workflowDatasetParamModelSlots) {
        add(datasetParams?.[modelIdKey], datasetParams?.[legacyKey]);
      }
    }
  }
  add(chatConfig?.questionGuide?.modelId, chatConfig?.questionGuide?.model);
  add(chatConfig?.ttsConfig?.modelId, chatConfig?.ttsConfig?.model);

  const identity = getModelReadIdentity()?.key;
  const refs = [...references.values()];
  const defaultChecks: Promise<MyModelItemType | undefined>[] = [];
  if (
    chatConfig?.questionGuide?.open === true &&
    isEmptyModelValue(getModelReferenceValue(chatConfig.questionGuide))
  ) {
    defaultChecks.push(getModelDefault({ modelType: ModelTypeEnum.llm }));
  }
  if (
    chatConfig?.ttsConfig?.type === 'model' &&
    isEmptyModelValue(getModelReferenceValue(chatConfig.ttsConfig))
  ) {
    defaultChecks.push(getModelDefault({ modelType: ModelTypeEnum.tts }));
  }
  const [details, defaultDetails] = await Promise.all([
    Promise.all(
      refs.map(async (reference) => {
        const detail = await getModelDetail(reference);
        if (detail || !reference.modelId || !legacySelectorValues.has(reference.modelId))
          return detail;
        return getModelDetail({ model: reference.modelId });
      })
    ),
    Promise.all(defaultChecks)
  ]);
  const models: (Pick<MyModelItemType, 'modelId' | 'type'> & {
    model?: string;
    scope?: string;
    isSystem?: boolean;
    tmbId?: unknown;
  })[] = [...details, ...defaultDetails].filter((model) => model !== undefined);
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
        // 基线摘要仅用于确认应用既有 modelId 引用的可用性（可能来自团队私有模型或当前成员无个人使用权的模型），
        // 且摘要接口未返回 scope/tmbId；若不显式标记 isSystem: false，isSystemModel() 会因缺少作用域字段
        // 将其误判为系统模型，导致空模型槽位（如“猜你想问”、语音合成）或旧名称回退误将其当作系统默认候选。
        models.push({ modelId: summary.modelId, type: summary.type, isSystem: false });
      }
    }
  }
  return models;
};
