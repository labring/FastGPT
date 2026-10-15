import type { WorkflowModelCheckData } from '@fastgpt/global/core/workflow/model/type';
import {
  getWorkflowNodeModelInputs,
  isWorkflowModelExpression,
  isWorkflowSystemModelInput
} from '@fastgpt/global/common/workflow/model';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  nodeInputIsReference,
  getSelectedInputRenderType
} from '@fastgpt/global/common/workflow/reference';
import {
  workflowDatasetParamModelSlots,
  workflowSystemModelSlots
} from '@fastgpt/global/core/workflow/model/constants';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { WorkflowRuleIssue } from '@/web/core/workflow/type';

const workflowCheckSkipNodeRuleTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.comment
]);

/** 节点与聊天配置共用引用匹配；非空稳定 ID 只在旧工具选择器边界允许按名称识别。 */
const isWorkflowModelReferenceAvailable = ({
  models,
  modelId,
  model,
  type,
  allowLegacyModelFallback = false
}: {
  models: WorkflowModelCheckData['references'];
  modelId?: unknown;
  model?: unknown;
  type: ModelTypeEnum;
  allowLegacyModelFallback?: boolean;
}) =>
  models.some(
    (item) =>
      item.type === type &&
      (!isEmptyModelValue(modelId)
        ? item.modelId === String(modelId) ||
          (allowLegacyModelFallback && item.legacyModel === modelId)
        : item.legacyModel === model)
  );

/** 检查自定义模型选择器与系统槽位；分组保留既有问题顺序。 */
export const checkWorkflowNodeModelRules = ({
  data,
  inputMap,
  modelData
}: {
  data: FlowNodeItemType;
  inputMap: Map<string, FlowNodeInputItemType>;
  modelData?: WorkflowModelCheckData;
}) => {
  const models = modelData?.references;
  const inputs = data.inputs;
  const issues: WorkflowRuleIssue[] = [];
  const datasetSelectInput = inputMap.get(NodeInputKeyEnum.datasetSelectList);
  const hasSelectedDataset =
    !datasetSelectInput ||
    nodeInputIsReference(datasetSelectInput) ||
    (Array.isArray(datasetSelectInput.value) && datasetSelectInput.value.length > 0);
  const datasetParamsInput = inputMap.get(NodeInputKeyEnum.datasetParams);
  const addUnavailableModelIssue = ({
    modelId,
    model,
    type,
    featureEnabled,
    inputKey,
    modelInput,
    fallbackLabel,
    defaultWhenEmpty = false,
    allowLegacyModelFallback = false
  }: {
    modelId?: unknown;
    model?: unknown;
    type: ModelTypeEnum;
    featureEnabled: boolean;
    inputKey: string;
    modelInput?: FlowNodeInputItemType;
    fallbackLabel?: string;
    defaultWhenEmpty?: boolean;
    allowLegacyModelFallback?: boolean;
  }) => {
    if (!featureEnabled || (modelInput && nodeInputIsReference(modelInput))) return;
    const value = getModelReferenceValue({ modelId, model });
    // 动态模型到执行点才能确定，发布前仅校验静态引用。
    if (isWorkflowModelExpression(value)) return;
    if (isEmptyModelValue(value)) {
      // 发布接口会为这些辅助功能写入默认模型；非空失效引用仍走下方严格校验。
      if (defaultWhenEmpty) return;
      issues.push({ code: 'model_required', inputKey, input: modelInput, fallbackLabel });
      return;
    }
    if (!models) return;

    const available = isWorkflowModelReferenceAvailable({
      models,
      modelId,
      model,
      type,
      allowLegacyModelFallback
    });
    if (available) return;

    issues.push({
      code: 'model_unavailable',
      inputKey,
      input: modelInput,
      fallbackLabel,
      model: String(value)
    });
  };

  // 1. 校验非系统槽位的自定义模型选择器。
  inputs.forEach((input) => {
    if (
      getSelectedInputRenderType(input) !== FlowNodeInputTypeEnum.selectLLMModel ||
      isWorkflowSystemModelInput({ node: data, input })
    ) {
      return;
    }

    addUnavailableModelIssue({
      modelId: input.value ?? input.defaultValue,
      type: ModelTypeEnum.llm,
      featureEnabled: !!input.required || !isEmptyModelValue(input.value ?? input.defaultValue),
      inputKey: input.key,
      modelInput: input,
      // 旧版 WorkflowTool 默认值保存的是 model，请求期间仍需兼容识别。
      allowLegacyModelFallback: true
    });
  });

  const customIssues = issues.splice(0);

  // 2. 校验节点系统模型槽位与 Agent 知识库参数模型。
  if (!workflowCheckSkipNodeRuleTypes.has(data.flowNodeType)) {
    for (const slot of workflowSystemModelSlots) {
      const { legacyKey, modelIdKey, label, type, featureKey, defaultWhenEmpty } = slot;
      const { modelIdInputs, legacyInputs } = getWorkflowNodeModelInputs({ node: data, slot });
      const templateModelInput =
        modelIdInputs.length === 0 && legacyInputs.length === 0
          ? moduleTemplatesFlat
              .find((template) => template.flowNodeType === data.flowNodeType)
              ?.inputs.find(
                (input) =>
                  input.key === modelIdKey && isWorkflowSystemModelInput({ node: data, input })
              )
          : undefined;
      const systemModelInputs = (() => {
        if (modelIdInputs.length > 0) return modelIdInputs;
        if (legacyInputs.length > 0) return legacyInputs;
        if (templateModelInput) return [templateModelInput];
        return [];
      })();
      if (systemModelInputs.length === 0) continue;

      const isDatasetQueryExtension =
        data.flowNodeType === FlowNodeTypeEnum.datasetSearchNode &&
        modelIdKey === NodeInputKeyEnum.datasetSearchExtensionModelId;
      // 问题优化摘要只展示实际 ID；旧名称或 defaultValue 不能掩盖尚未选择模型的状态。
      // 可选功能的开关缺省表示未开启，不借用模板默认值。
      const featureValue = featureKey
        ? hasSelectedDataset && inputMap.get(featureKey)?.value
        : true;
      const fallbackLegacyInput = legacyInputs[0];

      for (const systemModelInput of systemModelInputs) {
        const currentModelIdInput =
          systemModelInput.key === modelIdKey && modelIdInputs.length > 0
            ? systemModelInput
            : undefined;
        const currentLegacyInput =
          systemModelInput.key === legacyKey ? systemModelInput : fallbackLegacyInput;
        addUnavailableModelIssue({
          modelId: isDatasetQueryExtension
            ? currentModelIdInput?.value
            : (currentModelIdInput?.value ?? currentModelIdInput?.defaultValue),
          model: isDatasetQueryExtension
            ? undefined
            : (currentLegacyInput?.value ?? currentLegacyInput?.defaultValue),
          type,
          featureEnabled: Boolean(featureValue),
          defaultWhenEmpty,
          inputKey: isDatasetQueryExtension ? modelIdKey : systemModelInput.key,
          modelInput: systemModelInput,
          fallbackLabel: label
        });
      }
    }

    if (
      data.flowNodeType === FlowNodeTypeEnum.agent &&
      datasetParamsInput?.value &&
      typeof datasetParamsInput.value === 'object' &&
      !Array.isArray(datasetParamsInput.value)
    ) {
      const datasetParams = datasetParamsInput.value as Record<string, unknown>;
      const hasSelectedDataset =
        Array.isArray(datasetParams.datasets) && datasetParams.datasets.length > 0;
      for (const {
        legacyKey,
        modelIdKey,
        label,
        type,
        featureKey,
        defaultWhenEmpty
      } of workflowDatasetParamModelSlots) {
        addUnavailableModelIssue({
          modelId: datasetParams[modelIdKey],
          model: datasetParams[legacyKey],
          type,
          featureEnabled: hasSelectedDataset && Boolean(datasetParams[featureKey]),
          defaultWhenEmpty,
          inputKey: NodeInputKeyEnum.datasetParams,
          fallbackLabel: label
        });
      }
    }
  }

  return { customIssues, systemIssues: issues };
};

/** 检查聊天配置模型；沿用应用授权与模型类型约束，非空 ID 不允许按旧名称回退。 */
export const checkWorkflowChatModelRules = ({
  chatConfig,
  modelData
}: {
  chatConfig?: AppChatConfigType;
  modelData?: WorkflowModelCheckData;
}) => {
  const models = modelData?.references;
  const issues: WorkflowRuleIssue[] = [];
  const check = ({
    config,
    type,
    fieldLabel,
    enabled
  }: {
    config?: { modelId?: unknown; model?: unknown };
    type: ModelTypeEnum;
    fieldLabel: 'question_guide' | 'tts';
    enabled: boolean;
  }) => {
    if (!enabled || !config || !models) return;
    const value = getModelReferenceValue(config);
    if (isWorkflowModelExpression(value)) return;
    if (isEmptyModelValue(value)) {
      if (modelData?.defaultModelIds[type]) return;
      issues.push({ code: 'model_required', fieldLabel });
      return;
    }
    if (Array.isArray(value) || typeof value !== 'string') return;
    const available = isWorkflowModelReferenceAvailable({
      models,
      modelId: config.modelId,
      model: config.model,
      type
    });
    if (available) return;
    issues.push({ code: 'model_unavailable', fieldLabel, messageCode: 'model_unavailable_short' });
  };

  check({
    config: chatConfig?.questionGuide,
    type: ModelTypeEnum.llm,
    fieldLabel: 'question_guide',
    enabled: chatConfig?.questionGuide?.open === true
  });
  check({
    config: chatConfig?.ttsConfig,
    type: ModelTypeEnum.tts,
    fieldLabel: 'tts',
    enabled: chatConfig?.ttsConfig?.type === 'model'
  });
  return issues;
};
