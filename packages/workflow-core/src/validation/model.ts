import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  getWorkflowNodeModelInputs,
  isWorkflowModelExpression,
  isWorkflowSystemModelInput
} from '@fastgpt/global/common/workflow/model';
import {
  getSelectedInputRenderType,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getModelReferenceValue, isEmptyModelValue } from '@fastgpt/global/core/ai/model/reference';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  workflowDatasetParamModelSlots,
  workflowSystemModelSlots
} from '@fastgpt/global/core/workflow/model/constants';
import type { WorkflowModelCheckData } from '@fastgpt/global/core/workflow/model/type';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowDiagnostic } from '../domain/diagnostic';
import { hasConfiguredValue } from '../template/defaultValue';

/**
 * 根据调用方提供的模型状态检查节点与聊天配置，返回错误诊断，不修改文档、不查询目录或权限。
 * templates 为已注入的系统节点模板，用于识别被删掉的模型槽位，不会回填模板默认值。
 * 未提供目录时只检查节点模型必填；聊天模型与静态可用性等待目录加载后校验。
 * 已配置的动态模型留到执行点校验；空引用仍检查模型必填，避免资源绑定槽位绕过缺项检查。
 * 非空稳定 ID 不允许用旧名称修复，旧工具选择器除外。
 */
export const checkWorkflowModels = ({
  document,
  modelData,
  templates
}: {
  document: WorkflowDocument;
  modelData?: WorkflowModelCheckData;
  templates: ReadonlyArray<Pick<FlowNodeTemplateType, 'flowNodeType' | 'inputs'>>;
}): WorkflowDiagnostic[] => {
  const diagnostics: WorkflowDiagnostic[] = [];

  /** 节点、Agent 参数和聊天配置共享类型与引用匹配，定位信息由各调用点提供。 */
  const checkModel = ({
    modelId,
    model,
    type,
    enabled,
    input,
    location,
    defaultWhenEmpty = false,
    allowLegacyModelFallback = false,
    slotKey
  }: {
    modelId?: unknown;
    model?: unknown;
    type: ModelTypeEnum;
    enabled: boolean;
    input?: FlowNodeInputItemType;
    location: Pick<WorkflowDiagnostic, 'nodeId' | 'inputKey' | 'path'>;
    defaultWhenEmpty?: boolean;
    allowLegacyModelFallback?: boolean;
    slotKey?: string;
  }) => {
    if (!enabled) return;
    const isReference = input && nodeInputIsReference(input);
    if (isReference && hasConfiguredValue(input.value ?? input.defaultValue)) return;
    // 客户端已将失效引用视为空值，不能再把旧的模型名或引用模式当作有效配置。
    const value = isReference ? undefined : getModelReferenceValue({ modelId, model });
    if (isWorkflowModelExpression(value)) return;
    if (isEmptyModelValue(value)) {
      if (defaultWhenEmpty) return;
      diagnostics.push({
        code: WorkflowDiagnosticCodeEnum.modelRequired,
        severity: 'error',
        ...location,
        params: {
          type,
          ...(slotKey ? { slotKey } : {}),
          ...(allowLegacyModelFallback ? { customSelector: true } : {})
        }
      });
      return;
    }

    if (!modelData) return;
    const available = modelData.references.some(
      (item) =>
        item.type === type &&
        (!isEmptyModelValue(modelId)
          ? item.modelId === String(modelId) ||
            (allowLegacyModelFallback && item.legacyModel === modelId)
          : item.legacyModel === model)
    );
    if (available) return;
    diagnostics.push({
      code: WorkflowDiagnosticCodeEnum.modelUnavailable,
      severity: 'error',
      ...location,
      params: {
        type,
        model: String(value),
        ...(slotKey ? { slotKey } : {}),
        ...(allowLegacyModelFallback ? { customSelector: true } : {})
      }
    });
  };

  // 1. 自定义选择器和系统槽位分别识别，避免把外部工具同名参数当作系统模型。
  for (const [nodeIndex, node] of document.nodes.entries()) {
    const inputMap = new Map(node.inputs.map((input) => [input.key, input]));
    for (const [inputIndex, input] of node.inputs.entries()) {
      if (
        getSelectedInputRenderType(input) !== FlowNodeInputTypeEnum.selectLLMModel ||
        isWorkflowSystemModelInput({ node, input })
      ) {
        continue;
      }
      const value = input.value ?? input.defaultValue;
      checkModel({
        modelId: value,
        type: ModelTypeEnum.llm,
        enabled: Boolean(input.required) || !isEmptyModelValue(value),
        input,
        location: {
          nodeId: node.nodeId,
          inputKey: input.key,
          path: ['nodes', nodeIndex, 'inputs', inputIndex, 'value']
        },
        // 历史工具选择器的默认值可能仍保存模型名称。
        allowLegacyModelFallback: true
      });
    }

    if (
      node.flowNodeType === FlowNodeTypeEnum.workflowStart ||
      node.flowNodeType === FlowNodeTypeEnum.pluginInput ||
      node.flowNodeType === FlowNodeTypeEnum.comment
    ) {
      continue;
    }

    const datasetInput = inputMap.get(NodeInputKeyEnum.datasetSelectList);
    const hasDataset =
      !datasetInput ||
      (nodeInputIsReference(datasetInput) &&
        hasConfiguredValue(datasetInput.value ?? datasetInput.defaultValue)) ||
      (Array.isArray(datasetInput.value) && datasetInput.value.length > 0);

    for (const slot of workflowSystemModelSlots) {
      const { legacyKey, modelIdKey, type, featureKey, defaultWhenEmpty } = slot;
      const { modelIdInputs, legacyInputs } = getWorkflowNodeModelInputs({ node, slot });
      const templateInput =
        modelIdInputs.length === 0 && legacyInputs.length === 0
          ? templates
              .find((template) => template.flowNodeType === node.flowNodeType)
              ?.inputs.find(
                (input) => input.key === modelIdKey && isWorkflowSystemModelInput({ node, input })
              )
          : undefined;
      const modelInputs = (() => {
        if (modelIdInputs.length > 0) return modelIdInputs;
        if (legacyInputs.length > 0) return legacyInputs;
        return templateInput ? [templateInput] : [];
      })();
      const enabled = !featureKey || (hasDataset && Boolean(inputMap.get(featureKey)?.value));
      const isDatasetQueryExtension =
        node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode &&
        modelIdKey === NodeInputKeyEnum.datasetSearchExtensionModelId;

      for (const input of modelInputs) {
        const canonical = input.key === modelIdKey && modelIdInputs.length > 0 ? input : undefined;
        const legacy = input.key === legacyKey ? input : legacyInputs[0];
        checkModel({
          // 问题优化只认实际选择的 ID，旧名称和默认值不能掩盖未选择状态。
          modelId: isDatasetQueryExtension
            ? canonical?.value
            : (canonical?.value ?? canonical?.defaultValue),
          model: isDatasetQueryExtension ? undefined : (legacy?.value ?? legacy?.defaultValue),
          type,
          enabled,
          slotKey: modelIdKey,
          input,
          location: {
            nodeId: node.nodeId,
            inputKey: isDatasetQueryExtension ? modelIdKey : input.key,
            ...(node.inputs.includes(input)
              ? { path: ['nodes', nodeIndex, 'inputs', node.inputs.indexOf(input), 'value'] }
              : {})
          },
          // 与 Web 一致，辅助功能的空槽位由发布流程补默认模型；非空失效引用仍报错。
          defaultWhenEmpty
        });
      }
    }

    // 2. Agent 的知识库模型保存在 datasetParams 内，仅检查已选知识库且已开启的功能。
    const datasetParamsInput = inputMap.get(NodeInputKeyEnum.datasetParams);
    const datasetParams = datasetParamsInput?.value;
    if (
      node.flowNodeType === FlowNodeTypeEnum.agent &&
      datasetParamsInput &&
      datasetParams &&
      typeof datasetParams === 'object' &&
      !Array.isArray(datasetParams)
    ) {
      const hasAgentDataset =
        Array.isArray(datasetParams.datasets) && datasetParams.datasets.length > 0;
      for (const slot of workflowDatasetParamModelSlots) {
        checkModel({
          modelId: datasetParams[slot.modelIdKey],
          model: datasetParams[slot.legacyKey],
          type: slot.type,
          slotKey: slot.modelIdKey,
          enabled: hasAgentDataset && Boolean(datasetParams[slot.featureKey]),
          location: {
            nodeId: node.nodeId,
            inputKey: NodeInputKeyEnum.datasetParams,
            path: [
              'nodes',
              nodeIndex,
              'inputs',
              node.inputs.indexOf(datasetParamsInput),
              'value',
              slot.modelIdKey
            ]
          },
          defaultWhenEmpty: slot.defaultWhenEmpty
        });
      }
    }
  }

  // 3. 聊天配置的空模型需要调用方明确提供同类型默认模型，个人/团队目录不隐式充当默认值。
  for (const { configKey, type, enabled } of [
    {
      configKey: 'questionGuide',
      type: ModelTypeEnum.llm,
      enabled: document.chatConfig.questionGuide?.open === true
    },
    {
      configKey: 'ttsConfig',
      type: ModelTypeEnum.tts,
      enabled: document.chatConfig.ttsConfig?.type === 'model'
    }
  ] as const) {
    const config = document.chatConfig[configKey];
    if (!enabled || !config || !modelData) continue;
    const value = getModelReferenceValue(config);
    // 保留 Web 对动态或非字符串聊天配置的处理，结构合法性由配置 schema 负责。
    if (!isEmptyModelValue(value) && typeof value !== 'string') continue;
    checkModel({
      modelId: config.modelId,
      model: config.model,
      type,
      enabled: true,
      location: { path: ['chatConfig', configKey] },
      defaultWhenEmpty: Boolean(modelData.defaultModelIds[type])
    });
  }

  return diagnostics;
};
