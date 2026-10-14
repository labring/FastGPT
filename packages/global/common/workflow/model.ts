import { ModelTypeEnum } from '../../core/ai/constants';
import { getModelReferenceValue, isEmptyModelValue } from '../../core/ai/model/reference';
import { isSystemModel } from '../../core/ai/model/utils';
import type { AppChatConfigType } from '../../core/app/type';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '../../core/workflow/constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../core/workflow/node/constant';
import type { FlowNodeInputItemType } from '../../core/workflow/type/io';
import type { StoreNodeItemType } from '../../core/workflow/type/node';
import {
  workflowSystemModelSlots,
  workflowDatasetParamModelSlots
} from '../../core/workflow/model/constants';
import type {
  WorkflowModelFeature,
  WorkflowModelValidationIssue
} from '../../core/workflow/model/type';
import { nodeInputIsReference } from './reference';

const systemLLMNodeTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.chatNode,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.queryExtension,
  FlowNodeTypeEnum.agent,
  FlowNodeTypeEnum.toolCall
]);

/** 识别整体由工作流变量提供的模型表达式；实际模型 ID 由执行点解析并鉴权。 */
export const isWorkflowModelExpression = (value: unknown) =>
  typeof value === 'string' && /^\{\{.*\}\}$/.test(value);

/**
 * 判断模型字段是否属于 FastGPT 系统模型引用。
 * 外部工具可以自由声明 model/rerankModel 等同名参数，因此不能只根据 key 判断。
 */
export const isWorkflowSystemModelInput = ({
  node,
  input
}: {
  node: Pick<StoreNodeItemType, 'flowNodeType'>;
  input: FlowNodeInputItemType;
}) => {
  if (input.key === NodeInputKeyEnum.aiModel || input.key === NodeInputKeyEnum.aiModelId) {
    const renderTypeList = input.renderTypeList ?? [];
    return (
      renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel) ||
      renderTypeList.includes(FlowNodeInputTypeEnum.settingLLMModel) ||
      systemLLMNodeTypes.has(node.flowNodeType)
    );
  }

  if (
    input.key === NodeInputKeyEnum.datasetSearchRerankModel ||
    input.key === NodeInputKeyEnum.datasetSearchRerankModelId ||
    input.key === NodeInputKeyEnum.datasetSearchExtensionModel ||
    input.key === NodeInputKeyEnum.datasetSearchExtensionModelId ||
    input.key === NodeInputKeyEnum.datasetDeepSearchModel ||
    input.key === NodeInputKeyEnum.datasetDeepSearchModelId
  ) {
    return (
      node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode ||
      node.flowNodeType === FlowNodeTypeEnum.agent
    );
  }

  return false;
};

/** 识别系统模型槽位中的全部 canonical / legacy 输入，避免各入口自行选择重复 key。 */
export const getWorkflowNodeModelInputs = ({
  node,
  slot
}: {
  node: Pick<StoreNodeItemType, 'flowNodeType' | 'inputs'>;
  slot: (typeof workflowSystemModelSlots)[number];
}) => {
  const modelIdInputs = node.inputs.filter(
    (input) => input.key === slot.modelIdKey && isWorkflowSystemModelInput({ node, input })
  );
  const legacyInputs = node.inputs.filter(
    (input) => input.key === slot.legacyKey && isWorkflowSystemModelInput({ node, input })
  );
  return { modelIdInputs, legacyInputs };
};

/** 静态资源声明只收录明确开启的功能；动态开关在执行点按运行成员权限处理。 */
export const isWorkflowModelSlotEnabled = ({
  node,
  slot
}: {
  node: Pick<StoreNodeItemType, 'inputs'>;
  slot: (typeof workflowSystemModelSlots)[number];
}) => {
  if (!slot.featureKey) return true;
  const dataset = node.inputs.find((input) => input.key === NodeInputKeyEnum.datasetSelectList);
  const hasDataset =
    !dataset ||
    nodeInputIsReference(dataset) ||
    (Array.isArray(dataset.value) && dataset.value.length > 0);
  return (
    hasDataset &&
    node.inputs.some(
      (input) =>
        input.key === slot.featureKey && !nodeInputIsReference(input) && input.value === true
    )
  );
};

/**
 * 在 Workflow 写入与调试边界统一格式化模型引用。
 *
 * 动态引用只迁移到 canonical key，不做静态校验。静态引用优先按 modelId、其次按 legacy model
 * 精确解析；无法解析时：
 * - import：清空为 undefined；
 * - fallback：回退到有效系统默认同类型模型，再回退到首个 active 同类型模型；
 * - preserve / validate：共享同一套归一化与开启态空值默认回填逻辑（功能未开启时仅归一化 key 并保留原值），
 *   唯一区别是 validate 会在存在未配置或不可用模型时抛出校验错误阻断发布。
 */
export const formatModels = ({
  nodes,
  chatConfig,
  models = [],
  defaultModelIds = {},
  modelReferencePolicy
}: {
  nodes: StoreNodeItemType[] | undefined;
  chatConfig?: AppChatConfigType;
  models?: Array<{
    modelId: string;
    model: string;
    type: ModelTypeEnum;
    scope?: string;
    isSystem?: boolean;
    tmbId?: unknown;
  }>;
  defaultModelIds?: Partial<Record<ModelTypeEnum, string>>;
  modelReferencePolicy: 'preserve' | 'fallback' | 'validate' | 'import';
}) => {
  const validationIssues: WorkflowModelValidationIssue[] = [];
  /** 发布校验只保留功能级信息，服务端错误作为客户端的兜底提示。 */
  const addValidationIssue = (issue: WorkflowModelValidationIssue) => {
    const duplicated = validationIssues.some(
      (item) =>
        item.code === issue.code &&
        item.feature === issue.feature &&
        item.modelRef === issue.modelRef
    );
    if (!duplicated) validationIssues.push(issue);
  };
  const throwModelValidationErrors = () => {
    if (modelReferencePolicy !== 'validate' || validationIssues.length === 0) return;
    const featureNames: Record<WorkflowModelFeature, string> = {
      query_extension: 'Query extension',
      question_guide: 'Question guide',
      rerank: 'Rerank',
      tts: 'TTS',
      node_model: 'Model'
    };
    throw new Error(
      validationIssues
        .map(
          (issue) =>
            `${featureNames[issue.feature]} model ${issue.code === 'model_required' ? 'is not configured' : 'is unavailable'}`
        )
        .join('; ')
    );
  };
  const getFallbackModelId = (type: ModelTypeEnum) => {
    const defaultModelId = defaultModelIds[type];
    const defaultModel = models.find(
      (item) => isSystemModel(item) && item.modelId === defaultModelId && item.type === type
    );
    return (
      defaultModel?.modelId ??
      models.find((item) => isSystemModel(item) && item.type === type)?.modelId ??
      ''
    );
  };
  const isDynamicModelValue = (value: unknown) =>
    Array.isArray(value) || isWorkflowModelExpression(value);
  const canMaterializeDefault =
    modelReferencePolicy === 'preserve' || modelReferencePolicy === 'validate';

  const resolveModelId = ({
    modelId,
    model,
    type,
    featureEnabled,
    defaultWhenEmpty = false,
    feature
  }: {
    modelId?: unknown;
    model?: unknown;
    type: ModelTypeEnum;
    featureEnabled: boolean;
    defaultWhenEmpty?: boolean;
    feature: WorkflowModelFeature;
  }) => {
    const matchedModelById = !isEmptyModelValue(modelId)
      ? models.find((item) => item.modelId === String(modelId) && item.type === type)
      : undefined;
    // 旧 model 标识与跨环境导入只允许匹配系统模型，避免误命中团队私有模型。
    const matchedModelByName =
      typeof model === 'string'
        ? models.find((item) => isSystemModel(item) && item.model === model && item.type === type)
        : undefined;
    const matchedModel =
      matchedModelById ??
      (isEmptyModelValue(modelId) || modelReferencePolicy === 'import'
        ? matchedModelByName
        : undefined);
    if (matchedModel) return matchedModel.modelId;

    if (modelReferencePolicy === 'import') return undefined;
    if (modelReferencePolicy === 'fallback') return getFallbackModelId(type);

    const value = getModelReferenceValue({ modelId, model }) ?? modelId ?? model;
    if (!featureEnabled) return value;

    if (defaultWhenEmpty && isEmptyModelValue(value)) {
      const fallbackModelId = getFallbackModelId(type);
      if (fallbackModelId) return fallbackModelId;
    }

    addValidationIssue({
      code: isEmptyModelValue(value) ? 'model_required' : 'model_unavailable',
      feature,
      ...(isEmptyModelValue(value) ? {} : { modelRef: String(value) })
    });
    return value ?? '';
  };

  const formatConfigModelReference = ({
    config,
    legacyKey = 'model',
    modelIdKey = 'modelId',
    type,
    featureEnabled,
    feature
  }: {
    config?: Record<string, unknown>;
    legacyKey?: string;
    modelIdKey?: string;
    type: ModelTypeEnum;
    featureEnabled: boolean;
    feature: WorkflowModelFeature;
  }) => {
    if (!config) return;
    const modelId = config[modelIdKey];
    const model = config[legacyKey];
    if (modelId === undefined && model === undefined && (!canMaterializeDefault || !featureEnabled))
      return;
    if (isDynamicModelValue(modelId)) {
      delete config[legacyKey];
      return;
    }
    if (modelId === undefined && isDynamicModelValue(model)) {
      config[modelIdKey] = model;
      delete config[legacyKey];
      return;
    }

    config[modelIdKey] = resolveModelId({
      modelId,
      model,
      type,
      featureEnabled,
      defaultWhenEmpty: true,
      feature
    });
    delete config[legacyKey];
  };

  formatConfigModelReference({
    config: chatConfig?.questionGuide,
    type: ModelTypeEnum.llm,
    featureEnabled: chatConfig?.questionGuide?.open === true,
    feature: 'question_guide'
  });
  formatConfigModelReference({
    config: chatConfig?.ttsConfig,
    type: ModelTypeEnum.tts,
    featureEnabled: chatConfig?.ttsConfig?.type === 'model',
    feature: 'tts'
  });

  if (!nodes) {
    throwModelValidationErrors();
    return nodes;
  }

  nodes.forEach((node) => {
    for (const slot of workflowSystemModelSlots) {
      const { legacyKey, modelIdKey, type, feature, defaultWhenEmpty } = slot;
      const { modelIdInputs, legacyInputs } = getWorkflowNodeModelInputs({ node, slot });
      const featureEnabled = isWorkflowModelSlotEnabled({ node, slot });

      const candidateSynthesizedInput: FlowNodeInputItemType | undefined =
        modelIdInputs.length === 0 &&
        legacyInputs.length === 0 &&
        canMaterializeDefault &&
        featureEnabled &&
        defaultWhenEmpty
          ? {
              key: modelIdKey,
              label: '',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              valueType: WorkflowIOValueTypeEnum.string
            }
          : undefined;
      const synthesizedInput =
        candidateSynthesizedInput &&
        isWorkflowSystemModelInput({ node, input: candidateSynthesizedInput })
          ? candidateSynthesizedInput
          : undefined;
      const targetInputs =
        modelIdInputs.length > 0
          ? modelIdInputs
          : legacyInputs.length > 0
            ? legacyInputs
            : synthesizedInput
              ? [synthesizedInput]
              : [];
      if (targetInputs.length === 0) continue;

      const fallbackLegacyModel = legacyInputs[0]?.value;
      for (const targetInput of targetInputs) {
        if (!nodeInputIsReference(targetInput) && !isDynamicModelValue(targetInput.value)) {
          targetInput.value = resolveModelId({
            modelId: targetInput.key === modelIdKey ? targetInput.value : undefined,
            model: targetInput.key === legacyKey ? targetInput.value : fallbackLegacyModel,
            type,
            featureEnabled,
            defaultWhenEmpty,
            feature
          });
        }
        targetInput.key = modelIdKey;
      }
      if (synthesizedInput) {
        node.inputs.push(synthesizedInput);
      } else {
        node.inputs = node.inputs.filter(
          (input) => !(input.key === legacyKey && isWorkflowSystemModelInput({ node, input }))
        );
      }
    }

    const datasetParamsInput = node.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetParams
    );
    if (
      node.flowNodeType === FlowNodeTypeEnum.agent &&
      datasetParamsInput?.value &&
      typeof datasetParamsInput.value === 'object' &&
      !Array.isArray(datasetParamsInput.value)
    ) {
      const datasetParams = datasetParamsInput.value as Record<string, unknown>;
      const hasSelectedAgentDataset =
        Array.isArray(datasetParams.datasets) && datasetParams.datasets.length > 0;
      for (const slot of workflowDatasetParamModelSlots) {
        formatConfigModelReference({
          config: datasetParams,
          legacyKey: slot.legacyKey,
          modelIdKey: slot.modelIdKey,
          type: slot.type,
          featureEnabled: hasSelectedAgentDataset && datasetParams[slot.featureKey] === true,
          feature: slot.feature
        });
      }
    }
  });

  throwModelValidationErrors();

  return nodes;
};

/**
 * 为 JSON 导出补充可跨环境解析的 legacy model 名称，同时保留当前环境的 modelId。
 *
 * 只处理 FastGPT 系统模型引用；插件自定义的同名参数不会被改写。动态引用没有可反查的
 * 静态模型，因此不生成 legacy 字段。无法从当前模型目录解析的 ID 保持原样。
 */
export const addModelNamesToWorkflow = ({
  nodes,
  chatConfig,
  models = []
}: {
  nodes?: StoreNodeItemType[];
  chatConfig?: AppChatConfigType;
  models?: Array<{
    modelId: string;
    model: string;
    type: ModelTypeEnum;
    scope?: string;
    isSystem?: boolean;
    tmbId?: unknown;
  }>;
}) => {
  const findModelName = ({ modelId, type }: { modelId: unknown; type: ModelTypeEnum }) => {
    if (typeof modelId !== 'string') return;
    return models.find(
      (item) => isSystemModel(item) && item.modelId === modelId && item.type === type
    )?.model;
  };
  const addConfigModelName = ({
    config,
    legacyKey = 'model',
    modelIdKey = 'modelId',
    type
  }: {
    config?: Record<string, unknown>;
    legacyKey?: string;
    modelIdKey?: string;
    type: ModelTypeEnum;
  }) => {
    if (!config) return;
    const model = findModelName({ modelId: config[modelIdKey], type });
    if (model !== undefined) config[legacyKey] = model;
  };

  addConfigModelName({ config: chatConfig?.questionGuide, type: ModelTypeEnum.llm });
  addConfigModelName({ config: chatConfig?.ttsConfig, type: ModelTypeEnum.tts });

  nodes?.forEach((node) => {
    for (const { legacyKey, modelIdKey, type } of workflowSystemModelSlots) {
      const modelIdInput = node.inputs.find((input) => input.key === modelIdKey);
      if (
        !modelIdInput ||
        nodeInputIsReference(modelIdInput) ||
        !isWorkflowSystemModelInput({ node, input: modelIdInput })
      ) {
        continue;
      }

      const model = findModelName({ modelId: modelIdInput.value, type });
      if (model === undefined) continue;

      const legacyInput = node.inputs.find(
        (input) => input.key === legacyKey && isWorkflowSystemModelInput({ node, input })
      );
      if (legacyInput) {
        legacyInput.value = model;
      } else {
        node.inputs.push({ ...modelIdInput, key: legacyKey, value: model });
      }
    }

    const datasetParamsInput = node.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetParams
    );
    if (
      node.flowNodeType !== FlowNodeTypeEnum.agent ||
      !datasetParamsInput?.value ||
      typeof datasetParamsInput.value !== 'object' ||
      Array.isArray(datasetParamsInput.value)
    ) {
      return;
    }

    const datasetParams = datasetParamsInput.value as Record<string, unknown>;
    for (const { legacyKey, modelIdKey, type } of workflowDatasetParamModelSlots) {
      addConfigModelName({
        config: datasetParams,
        legacyKey,
        modelIdKey,
        type
      });
    }
  });

  return nodes;
};
