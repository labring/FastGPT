import { NodeInputKeyEnum, NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../../constants';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import {
  getSelectedInputRenderType,
  isWorkflowSystemModelInput,
  nodeInputIsReference,
  workflowModelKeyMappings
} from '../../utils';
import { moduleTemplatesFlat } from '../../template/constants';
import { LoopRunModeEnum } from '../../template/system/loopRun/loopRun';
import { VariableConditionEnum } from '../../template/system/ifElse/constant';
import { PluginStatusEnum } from '../../../plugin/type';
import { AppErrEnum } from '../../../../common/error/code/app';
import { PluginErrEnum } from '../../../../common/error/code/plugin';
import { ERROR_RESPONSE } from '../../../../common/error/errorCode';
import { isToolNotExistError } from '../../../app/utils';
import {
  canInputBeAgentGenerated,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput,
  isToolInputValueConfigured,
  isToolParamInput
} from '../../../app/formEdit/utils';
import { ModelTypeEnum } from '../../../ai/constants';
import { getModelReferenceValue, isEmptyModelValue } from '../../../ai/modelReference';
import {
  getWorkflowReferenceItemsFromValue,
  isConfiguredReferenceValue,
  isEmptyReferenceValue,
  workflowValueTypeIsCompatible
} from '../utils';
import type { WorkflowIssueCode } from '../issueCode';
import type { WorkflowConfigIssue, WorkflowEnvironment, WorkflowReferenceStatus } from '../types';
import type { FlowNodeInputItemType } from '../../type/io';
import type { WorkflowCheckIssue } from '../../type/node';
import type { IfElseListItemType } from '../../template/system/ifElse/type';
import type { TUpdateListItem } from '../../template/system/variableUpdate/type';
import type { DocumentReadApi, NodeRecord, ReferenceReadApi } from './types';

/**
 * Issue 判定规则：全部是纯函数，只读 Document 派生数据与环境事实，
 * 产出 code / level / inputKey / params，不持状态、不产出文案、不写 Document。
 * 边界与 documentRules.ts 一致；状态、scope 与缓存归 issueModule。
 */

// region issueInputs Issue rule inputs and classifiers

/** 规则入参：文档只读面、引用只读面、可达集合与本轮环境事实。 */
export type IssueRuleInput = {
  document: DocumentReadApi;
  reference: ReferenceReadApi;
  /** 从流程起点可达的节点集合；结构变化后由 Issue module 增量维护。 */
  reachableNodeIds: ReadonlySet<string>;
  environment: WorkflowEnvironment;
};

/** 不参与连线检查的节点类型：注释、全局变量与占位节点本身不承载流程。 */
const skipConnectionTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.comment,
  FlowNodeTypeEnum.globalVariable,
  FlowNodeTypeEnum.emptyNode
]);

/** 流程起点：不要求上游连线。 */
const startTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.nestedStart,
  FlowNodeTypeEnum.loopRunStart
]);

/** 起点、插件入参与注释不跑节点专属规则，也不跑通用必填/引用校验。 */
const skipNodeRuleTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.comment
]);

/** 需要 sandbox 的节点类型。 */
const sandboxNodeTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.agent,
  FlowNodeTypeEnum.toolCall
]);

/** label 缺失时按 key 回退到模型字段文案，避免把 aiModelId 这类内部 key 展示给用户。 */
const MODEL_INPUT_LABELS: Record<string, string> = {
  [NodeInputKeyEnum.aiModelId]: 'common:core.ai.Model',
  [NodeInputKeyEnum.aiModel]: 'common:core.ai.Model',
  [NodeInputKeyEnum.datasetSearchRerankModelId]: 'common:core.dataset.search.ReRank',
  [NodeInputKeyEnum.datasetSearchRerankModel]: 'common:core.dataset.search.ReRank',
  [NodeInputKeyEnum.datasetSearchExtensionModelId]: 'common:core.module.template.Query extension',
  [NodeInputKeyEnum.datasetSearchExtensionModel]: 'common:core.module.template.Query extension',
  [NodeInputKeyEnum.datasetDeepSearchModelId]: 'common:deep_rag_search',
  [NodeInputKeyEnum.datasetDeepSearchModel]: 'common:deep_rag_search'
};

/** 只需要 key/label/debugLabel 的字段标识；label 缺失时按 MODEL_INPUT_LABELS 或 key 回退。 */
type IssueInputName = { key: string; label?: string; debugLabel?: string };

/**
 * params.inputName 的取值链：label -> debugLabel -> 模型字段映射 -> input.key。
 * 返回原始字符串（模板 label 是 i18n key），翻译由渲染层完成，语言切换不需要重算 Issue。
 */
const getInputName = (input: IssueInputName) =>
  (typeof input.label === 'string' && input.label ? input.label : undefined) ||
  (typeof input.debugLabel === 'string' && input.debugLabel ? input.debugLabel : undefined) ||
  MODEL_INPUT_LABELS[input.key] ||
  input.key;

/** 普通字段的空值判定；引用字段用 isEmptyReferenceValue，它额外识别 ['', ''] 占位元组。 */
const isEmptyInputValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

/** hidden 与非必填 any 不参与通用必填校验，避免系统 hidden 字段误报或与节点专属规则重复。 */
const skipGenericRequiredCheck = (input: FlowNodeInputItemType) => {
  if (getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.hidden) return true;
  if (!input.valueType) return true;
  if (input.valueType === WorkflowIOValueTypeEnum.boolean) return true;
  if (input.valueType === WorkflowIOValueTypeEnum.any) return !input.required;
  return false;
};

/** 变量更新条目的值是否为空：引用型看引用是否配置，clear/boolean 模式恒有值。 */
const isVariableUpdateValueEmpty = (item: TUpdateListItem) => {
  if (item.renderType === FlowNodeInputTypeEnum.reference) {
    return !isConfiguredReferenceValue(item.value);
  }
  if (item.arrayMode === 'clear' || item.booleanMode) return false;
  const value = item.value?.[1];
  return value === undefined || value === null || value === '';
};

/** 引用状态里会转成 Issue 的三种 code；empty 与 valid 不产出问题。 */
type ReferenceIssueCode = 'invalid_reference' | 'unreachable_reference' | 'invalid_reference_type';

/** 多项引用状态聚合成一个 code；同一字段只报最严重的一条，优先级与选择器提示一致。 */
const REFERENCE_ISSUE_PRIORITY: ReferenceIssueCode[] = [
  'invalid_reference',
  'unreachable_reference',
  'invalid_reference_type'
];
const pickReferenceIssueCode = (
  statuses: WorkflowReferenceStatus[]
): ReferenceIssueCode | undefined =>
  REFERENCE_ISSUE_PRIORITY.find((code) => statuses.some((status) => status.code === code));

const PLUGIN_PERMISSION_ERROR_CODES = new Set<string>([AppErrEnum.unAuthApp, PluginErrEnum.unAuth]);
const PLUGIN_MISSING_ERROR_CODES = new Set<string>([AppErrEnum.unExist, PluginErrEnum.unExist]);

/** pluginData.error 可能是 statusText，也可能是 getErrText 翻译后的 message，两种都要识别。 */
const resolvePluginErrorIssueCode = (
  error: string
): 'tool_no_permission' | 'tool_missing' | 'tool_load_failed' => {
  if (
    PLUGIN_PERMISSION_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unAuthApp]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unAuth]?.message
  ) {
    return 'tool_no_permission';
  }
  if (
    PLUGIN_MISSING_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unExist]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unExist]?.message ||
    isToolNotExistError(error)
  ) {
    return 'tool_missing';
  }
  return 'tool_load_failed';
};

/** 动态引用（{{...}}）与数组形式的模型值由运行时解析，编辑期不判定可用性。 */
const isDynamicModelValue = (value: unknown) =>
  Array.isArray(value) || (typeof value === 'string' && /^\{\{.*\}\}$/.test(value));

// endregion

// region nodeIssues Node issue collection

/**
 * 计算单个节点的全部 Issue。
 *
 * 文档规则（必填、引用、节点专属、连线、工具与插件状态）随时可判定；环境规则里模型部分
 * 在 `environment.models` 缺省（目录未就绪）时整块跳过，等 host 订阅到目录变化后
 * 调用 refreshIssues 补上，避免冷启动阶段误报模型不可用。
 */
export const collectNodeIssues = (
  { document, reference, reachableNodeIds, environment }: IssueRuleInput,
  node: NodeRecord
): WorkflowCheckIssue[] => {
  const current = document.getDocument();
  const graphIndex = document.getGraphIndex();
  const isSourceEdgeValid = document.isSourceEdgeValid;
  const data = node.data;
  const nodeId = data.nodeId;
  const inputs = data.inputs;
  const inputMap = new Map(inputs.map((input) => [input.key, input]));
  const datasetSelectInput = inputMap.get(NodeInputKeyEnum.datasetSelectList);
  const hasSelectedDataset =
    !datasetSelectInput ||
    nodeInputIsReference(datasetSelectInput) ||
    (Array.isArray(datasetSelectInput.value) && datasetSelectInput.value.length > 0);
  const models = environment.models;

  const issues: WorkflowCheckIssue[] = [];
  /** 同一节点上 code + inputKey 相同即视为同一条问题，重复命中只保留第一条。 */
  const addIssue = ({
    code,
    inputKey,
    params
  }: {
    code: WorkflowIssueCode;
    inputKey?: string;
    params?: Record<string, string>;
  }) => {
    if (issues.some((issue) => issue.code === code && issue.inputKey === inputKey)) return;
    issues.push({
      nodeId,
      level: 'error',
      code,
      ...(inputKey ? { inputKey } : {}),
      ...(params ? { params } : {})
    });
  };

  const incomingEdges = (graphIndex.byTarget.get(nodeId) ?? []).filter(isSourceEdgeValid);
  const outgoingEdges = (graphIndex.bySource.get(nodeId) ?? []).filter(isSourceEdgeValid);
  // 被工具选择边指向的节点算工具节点：代码节点动态入参与 HTTP 工具参数的校验会放宽。
  const isToolNode = incomingEdges.some(
    (edge) => edge.data.targetHandle === NodeOutputKeyEnum.selectedTools
  );

  // sandbox 不可用属于环境问题，但能定位到具体字段，因此排在最前面。
  if (
    sandboxNodeTypes.has(data.flowNodeType) &&
    !!inputMap.get(NodeInputKeyEnum.useAgentSandbox)?.value
  ) {
    if (!environment.sandbox.configured) {
      addIssue({ code: 'sandbox_not_configured', inputKey: NodeInputKeyEnum.useAgentSandbox });
    } else if (!environment.sandbox.planSupported) {
      addIssue({ code: 'sandbox_plan_not_supported', inputKey: NodeInputKeyEnum.useAgentSandbox });
    }
  }

  /**
   * 模型可用性规则：未选择模型报 model_required，选了但当前目录里没有报 model_unavailable。
   * 目录未就绪时直接跳过，冷启动阶段不产出模型问题。
   */
  const addModelIssue = ({
    modelId,
    model,
    type,
    featureEnabled,
    inputKey,
    modelInput,
    defaultWhenEmpty = false,
    allowLegacyModelFallback = false
  }: {
    modelId?: unknown;
    model?: unknown;
    type: ModelTypeEnum;
    featureEnabled: boolean;
    inputKey: string;
    modelInput?: IssueInputName;
    defaultWhenEmpty?: boolean;
    allowLegacyModelFallback?: boolean;
  }) => {
    if (!featureEnabled || !models) return;
    const value = getModelReferenceValue({ modelId, model });
    if (isDynamicModelValue(value)) return;
    const inputName = getInputName(modelInput ?? inputMap.get(inputKey) ?? { key: inputKey });
    if (isEmptyModelValue(value)) {
      if (defaultWhenEmpty) return;
      addIssue({ code: 'model_required', inputKey, params: { inputName } });
      return;
    }
    const available = !isEmptyModelValue(modelId)
      ? models.some(
          (item) =>
            item.type === type &&
            (item.modelId === String(modelId) ||
              (allowLegacyModelFallback && item.model === modelId))
        )
      : models.some((item) => item.model === model && item.type === type);
    if (available) return;
    addIssue({
      code: 'model_unavailable',
      inputKey,
      params: {
        model: String(value),
        nodeName: data.name,
        inputName
      }
    });
  };

  inputs.forEach((input) => {
    if (
      getSelectedInputRenderType(input) !== FlowNodeInputTypeEnum.selectLLMModel ||
      isWorkflowSystemModelInput({ node: data, input })
    ) {
      return;
    }
    addModelIssue({
      modelId: input.value ?? input.defaultValue,
      type: ModelTypeEnum.llm,
      featureEnabled: !!input.required || !isEmptyModelValue(input.value ?? input.defaultValue),
      inputKey: input.key,
      // 旧版 WorkflowTool 默认值保存的是 model，请求期间仍需兼容识别。
      allowLegacyModelFallback: true
    });
  });

  const pluginStatus = data.pluginData?.status;
  if (pluginStatus === PluginStatusEnum.Offline) {
    addIssue({ code: 'tool_offline' });
  } else if (data.pluginData?.error) {
    addIssue({ code: resolvePluginErrorIssueCode(data.pluginData.error) });
  }

  /** 资源选择器沿用服务端返回的 error 标记，统一映射为稳定 Issue code。 */
  const addResourceIssues = (value: unknown, inputKey: string) => {
    if (!Array.isArray(value)) return;
    const resourceItems = value.filter(
      (item): item is { error?: unknown } => !!item && typeof item === 'object'
    );
    if (resourceItems.some((item) => item.error === 'resource_no_permission')) {
      addIssue({ code: 'resource_no_permission', inputKey });
    }
    if (resourceItems.some((item) => item.error && item.error !== 'resource_no_permission')) {
      addIssue({ code: 'resource_missing', inputKey });
    }
  };

  [NodeInputKeyEnum.datasetSelectList, NodeInputKeyEnum.skills].forEach((key) =>
    addResourceIssues(inputMap.get(key)?.value, key)
  );

  const datasetParamsInput = inputMap.get(NodeInputKeyEnum.datasetParams);
  if (
    data.flowNodeType === FlowNodeTypeEnum.agent &&
    datasetParamsInput?.value &&
    typeof datasetParamsInput.value === 'object' &&
    !Array.isArray(datasetParamsInput.value)
  ) {
    addResourceIssues(
      (datasetParamsInput.value as { datasets?: unknown }).datasets,
      NodeInputKeyEnum.datasetParams
    );
  }

  // 工具调用下游工具只有 systemInputConfig 未配置时才算未激活；
  // 普通必填参数为空由下面的通用必填校验单独提示，不能复用整体工具配置状态。
  const systemInputConfig = inputMap.get(NodeInputKeyEnum.systemInputConfig);
  if (
    isToolNode &&
    systemInputConfig &&
    !isToolInputValueConfigured({ input: systemInputConfig })
  ) {
    addIssue({ code: 'tool_waiting_config', inputKey: NodeInputKeyEnum.systemInputConfig });
  }

  if (!skipNodeRuleTypes.has(data.flowNodeType)) {
    for (const [legacyKey, modelIdKey] of workflowModelKeyMappings) {
      const legacyInput = inputMap.get(legacyKey);
      const modelIdInput = inputMap.get(modelIdKey);
      const systemModelInput =
        modelIdInput ??
        legacyInput ??
        moduleTemplatesFlat
          .find((template) => template.flowNodeType === data.flowNodeType)
          ?.inputs.find((input) => input.key === modelIdKey);
      if (
        !systemModelInput ||
        !isWorkflowSystemModelInput({ node: data, input: systemModelInput })
      ) {
        continue;
      }

      const type =
        legacyKey === NodeInputKeyEnum.datasetSearchRerankModel
          ? ModelTypeEnum.rerank
          : ModelTypeEnum.llm;
      const featureKey = (() => {
        if (legacyKey === NodeInputKeyEnum.datasetSearchRerankModel) {
          return NodeInputKeyEnum.datasetSearchUsingReRank;
        }
        if (legacyKey === NodeInputKeyEnum.datasetSearchExtensionModel) {
          return NodeInputKeyEnum.datasetSearchUsingExtensionQuery;
        }
        if (legacyKey === NodeInputKeyEnum.datasetDeepSearchModel) {
          return NodeInputKeyEnum.datasetDeepSearch;
        }
      })();
      const isDatasetQueryExtension =
        data.flowNodeType === FlowNodeTypeEnum.datasetSearchNode &&
        modelIdKey === NodeInputKeyEnum.datasetSearchExtensionModelId;
      // 问题提示只展示实际 ID；旧名称或 defaultValue 不能掩盖尚未选择模型的状态。
      // 可选功能的开关缺省表示未开启，不借用模板默认值。
      const featureValue = featureKey
        ? hasSelectedDataset && inputMap.get(featureKey)?.value
        : true;
      addModelIssue({
        modelId: isDatasetQueryExtension
          ? modelIdInput?.value
          : (modelIdInput?.value ?? modelIdInput?.defaultValue),
        model: isDatasetQueryExtension
          ? undefined
          : (legacyInput?.value ?? legacyInput?.defaultValue),
        type,
        featureEnabled: Boolean(featureValue),
        defaultWhenEmpty:
          modelIdKey === NodeInputKeyEnum.datasetSearchRerankModelId ||
          modelIdKey === NodeInputKeyEnum.datasetSearchExtensionModelId,
        inputKey: isDatasetQueryExtension ? modelIdKey : systemModelInput.key,
        modelInput: systemModelInput
      });
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
      addModelIssue({
        modelId: datasetParams[NodeInputKeyEnum.datasetSearchRerankModelId],
        model: datasetParams[NodeInputKeyEnum.datasetSearchRerankModel],
        type: ModelTypeEnum.rerank,
        featureEnabled:
          hasSelectedDataset && Boolean(datasetParams[NodeInputKeyEnum.datasetSearchUsingReRank]),
        defaultWhenEmpty: true,
        inputKey: NodeInputKeyEnum.datasetParams,
        modelInput: { key: NodeInputKeyEnum.datasetSearchRerankModelId }
      });
      addModelIssue({
        modelId: datasetParams[NodeInputKeyEnum.datasetSearchExtensionModelId],
        model: datasetParams[NodeInputKeyEnum.datasetSearchExtensionModel],
        type: ModelTypeEnum.llm,
        featureEnabled:
          hasSelectedDataset &&
          Boolean(datasetParams[NodeInputKeyEnum.datasetSearchUsingExtensionQuery]),
        defaultWhenEmpty: true,
        inputKey: NodeInputKeyEnum.datasetParams,
        modelInput: { key: NodeInputKeyEnum.datasetSearchExtensionModelId }
      });
    }

    if (data.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
      const ifElseList = inputMap.get(NodeInputKeyEnum.ifElseList)?.value as
        | IfElseListItemType[]
        | undefined;
      const hasIncompleteCondition = (ifElseList ?? []).some((branch) =>
        branch.list.some((condition) => {
          const hasEmptyVariable =
            condition.variable === undefined || isEmptyReferenceValue(condition.variable);
          const hasEmptyValue =
            condition.value === undefined ||
            (condition.valueType === 'reference' && isEmptyReferenceValue(condition.value));
          return (
            hasEmptyVariable ||
            condition.condition === undefined ||
            (hasEmptyValue &&
              condition.condition !== VariableConditionEnum.isEmpty &&
              condition.condition !== VariableConditionEnum.isNotEmpty)
          );
        })
      );
      if (!ifElseList || hasIncompleteCondition) {
        addIssue({ code: 'if_else_incomplete', inputKey: NodeInputKeyEnum.ifElseList });
      }

      ifElseList?.forEach((branch, branchIndex) => {
        branch.list.forEach((condition, conditionIndex) => {
          const prefix = `${NodeInputKeyEnum.ifElseList}[${branchIndex}].list[${conditionIndex}]`;
          const variableCode = pickReferenceIssueCode(
            reference.getValueStatuses({ value: condition.variable, targetNodeId: nodeId })
          );
          if (variableCode) {
            addIssue({
              code: variableCode,
              inputKey: `${prefix}.variable`,
              params: { inputName: 'common:core.workflow.variable' }
            });
          }

          if (condition.valueType !== 'reference') return;
          const valueCode = pickReferenceIssueCode(
            reference.getValueStatuses({
              value: condition.value,
              targetNodeId: nodeId,
              targetType: reference.getReferenceValueType(condition.variable)
            })
          );
          if (valueCode) {
            addIssue({
              code: valueCode,
              inputKey: `${prefix}.value`,
              params: { inputName: 'common:value' }
            });
          }
        });
      });
    }

    if (data.flowNodeType === FlowNodeTypeEnum.userSelect) {
      const options = inputMap.get(NodeInputKeyEnum.userSelectOptions)?.value as
        | Array<{ value?: string }>
        | undefined;
      if (!options || options.length === 0) {
        addIssue({ code: 'user_select_empty', inputKey: NodeInputKeyEnum.userSelectOptions });
      } else if (options.some((option) => !option.value)) {
        addIssue({
          code: 'user_select_value_empty',
          inputKey: NodeInputKeyEnum.userSelectOptions
        });
      }
    }

    if (data.flowNodeType === FlowNodeTypeEnum.formInput) {
      const forms = inputMap.get(NodeInputKeyEnum.userInputForms)?.value as unknown[] | undefined;
      if (!forms || forms.length === 0) {
        addIssue({ code: 'form_input_empty', inputKey: NodeInputKeyEnum.userInputForms });
      }
    }

    if (data.flowNodeType === FlowNodeTypeEnum.datasetConcatNode) {
      if (!inputs.some((input) => input.canEdit)) {
        addIssue({
          code: 'required_input_empty',
          inputKey: NodeInputKeyEnum.datasetQuoteList,
          params: { inputName: 'common:core.workflow.Dataset quote' }
        });
      }
    }

    if (data.flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
      const agents = inputMap.get(NodeInputKeyEnum.agents)?.value as
        | Array<{ value?: string }>
        | undefined;
      if (!agents || agents.length === 0) {
        addIssue({ code: 'classify_question_empty', inputKey: NodeInputKeyEnum.agents });
      } else if (agents.some((agent) => !agent.value)) {
        addIssue({ code: 'classify_question_value_empty', inputKey: NodeInputKeyEnum.agents });
      }
    }

    if (data.flowNodeType === FlowNodeTypeEnum.code) {
      const hasIncompleteDynamicInput = inputs.some((input) => {
        if (
          [
            NodeInputKeyEnum.code,
            NodeInputKeyEnum.codeType,
            NodeInputKeyEnum.addInputParam
          ].includes(input.key as NodeInputKeyEnum) ||
          !input.canEdit
        ) {
          return false;
        }
        // 工具参数由 Agent 生成时无需填写引用值；手动模式仍按代码变量校验。
        if (
          isToolNode &&
          isAgentGeneratedToolInput(
            initToolInputTypeByDefaultMode(input, { allowUserChatInputAgentGenerated: true })
          ) &&
          canInputBeAgentGenerated(input)
        ) {
          return false;
        }
        return !input.key || !input.label || isEmptyReferenceValue(input.value);
      });
      if (hasIncompleteDynamicInput) addIssue({ code: 'code_input_incomplete' });
    }

    if (data.flowNodeType === FlowNodeTypeEnum.httpRequest468) {
      if (isEmptyInputValue(inputMap.get(NodeInputKeyEnum.httpReqUrl)?.value)) {
        addIssue({ code: 'http_url_empty', inputKey: NodeInputKeyEnum.httpReqUrl });
      }
    }

    if (data.flowNodeType === FlowNodeTypeEnum.contentExtract) {
      const extractKeys = inputMap.get(NodeInputKeyEnum.extractKeys)?.value as
        | unknown[]
        | undefined;
      if (!extractKeys || extractKeys.length === 0) {
        addIssue({ code: 'context_extract_empty', inputKey: NodeInputKeyEnum.extractKeys });
      }
    }

    if (data.flowNodeType === FlowNodeTypeEnum.loopRun) {
      if (inputMap.get(NodeInputKeyEnum.loopRunMode)?.value === LoopRunModeEnum.conditional) {
        const childIds = inputMap.get(NodeInputKeyEnum.childrenNodeIdList)?.value as
          | string[]
          | undefined;
        const childIdSet = new Set(childIds ?? []);
        const hasBreak = current.nodes.some(
          (child) =>
            childIdSet.has(child.data.nodeId) &&
            child.data.flowNodeType === FlowNodeTypeEnum.loopRunBreak
        );
        if (!hasBreak) addIssue({ code: 'loop_run_missing_break' });
      }
    }

    if (data.flowNodeType === FlowNodeTypeEnum.toolCall) {
      const hasToolConnection = outgoingEdges.some(
        (edge) => edge.data.sourceHandle === NodeOutputKeyEnum.selectedTools
      );
      if (!hasToolConnection && !inputMap.get(NodeInputKeyEnum.useAgentSandbox)?.value) {
        addIssue({ code: 'tool_call_empty', inputKey: NodeInputKeyEnum.useAgentSandbox });
      }
    }

    if (data.flowNodeType === FlowNodeTypeEnum.variableUpdate) {
      const updateList = inputMap.get(NodeInputKeyEnum.updateList)?.value as
        | TUpdateListItem[]
        | undefined;
      const addUpdateIssue = ({
        field,
        index,
        code
      }: {
        field: 'variable' | 'value';
        index?: number;
        code: WorkflowIssueCode;
      }) => {
        // 只有定位到具体条目的引用问题才带下标；必填问题统一挂在 updateList 上。
        addIssue({
          code,
          inputKey:
            code !== 'required_input_empty' && index !== undefined
              ? `${NodeInputKeyEnum.updateList}[${index}].${field}`
              : NodeInputKeyEnum.updateList,
          params: {
            inputName: field === 'variable' ? 'common:core.workflow.variable' : 'common:value'
          }
        });
      };

      if (!updateList || updateList.length === 0) {
        addUpdateIssue({ field: 'variable', code: 'required_input_empty' });
        addUpdateIssue({ field: 'value', code: 'required_input_empty' });
      } else {
        updateList.forEach((item, index) => {
          const variableCode = pickReferenceIssueCode(
            reference.getValueStatuses({ value: item.variable, targetNodeId: nodeId })
          );
          const variableType = reference.getReferenceValueType(item.variable);
          if (!isConfiguredReferenceValue(item.variable)) {
            addUpdateIssue({ field: 'variable', index, code: 'required_input_empty' });
          } else if (variableCode) {
            addUpdateIssue({ field: 'variable', index, code: variableCode });
          } else if (
            item.valueType &&
            !workflowValueTypeIsCompatible(item.valueType, variableType)
          ) {
            addUpdateIssue({ field: 'variable', index, code: 'invalid_reference_type' });
          }

          const valueCode =
            item.renderType === FlowNodeInputTypeEnum.reference
              ? pickReferenceIssueCode(
                  reference.getValueStatuses({
                    value: item.value,
                    targetNodeId: nodeId,
                    targetType: variableType
                  })
                )
              : undefined;
          if (isVariableUpdateValueEmpty(item)) {
            addUpdateIssue({ field: 'value', index, code: 'required_input_empty' });
          } else if (valueCode) {
            addUpdateIssue({ field: 'value', index, code: valueCode });
          }
        });
      }
    }

    inputs.forEach((input) => {
      // 条件循环的数组入参由循环体自行消费，不做引用与必填校验。
      if (
        input.key === NodeInputKeyEnum.loopRunInputArray &&
        data.flowNodeType === FlowNodeTypeEnum.loopRun &&
        inputMap.get(NodeInputKeyEnum.loopRunMode)?.value === LoopRunModeEnum.conditional
      ) {
        return;
      }
      // HTTP 工具的动态参数由工具调用方填写，不在工具节点自身校验。
      if (
        data.flowNodeType === FlowNodeTypeEnum.httpRequest468 &&
        isToolNode &&
        isToolParamInput(input)
      ) {
        return;
      }

      const isReferenceInput = nodeInputIsReference(input);
      // 节点未显式配置时运行期会回退 defaultValue；检查必须与实际执行一致。
      const effectiveValue = input.value ?? input.defaultValue;
      // 混合模式字段（textarea/reference）可能存着引用元组而 selectedType 不是 reference，
      // 因此按值判定是否参与引用校验；childrenNodeIdList 的二元 ID 数组是结构数据，不是引用。
      const hasReferenceItems =
        input.key !== NodeInputKeyEnum.childrenNodeIdList &&
        getWorkflowReferenceItemsFromValue(effectiveValue).length > 0;
      // 独立 reference 字段复用字段身份缓存；ifElse、variableUpdate、动态入参等结构化值
      // 仍按值展开，保留其嵌套引用与畸形数组语义。
      const referenceStatuses = isReferenceInput
        ? reference.getFieldStatuses(nodeId, input)
        : hasReferenceItems
          ? reference.getValueStatuses({
              value: effectiveValue,
              targetNodeId: nodeId,
              targetType: input.valueType
            })
          : [];
      const referenceIssueCode = pickReferenceIssueCode(referenceStatuses);
      if (referenceIssueCode) {
        addIssue({
          code: referenceIssueCode,
          inputKey: input.key,
          params: { inputName: getInputName(input) }
        });
      }

      if (skipGenericRequiredCheck(input)) return;
      // Agent 生成字段运行时由模型填写，不需要开发者预填。
      const normalizedInput =
        isToolNode || input.key === NodeInputKeyEnum.userChatInput
          ? initToolInputTypeByDefaultMode(input, { allowUserChatInputAgentGenerated: isToolNode })
          : input;
      if (
        isToolNode &&
        isAgentGeneratedToolInput(normalizedInput) &&
        canInputBeAgentGenerated(normalizedInput)
      ) {
        return;
      }

      const valueIsEmpty = isReferenceInput
        ? isEmptyReferenceValue(effectiveValue)
        : isEmptyInputValue(effectiveValue);
      // 代码节点的动态入参由专属规则统一提示，不走通用必填。
      if (
        input.required &&
        valueIsEmpty &&
        !(data.flowNodeType === FlowNodeTypeEnum.code && input.canEdit)
      ) {
        addIssue({
          code: 'required_input_empty',
          inputKey: input.key,
          params: { inputName: getInputName(input) }
        });
      }
    });
  }

  if (!skipConnectionTypes.has(data.flowNodeType)) {
    const isStartNode = startTypes.has(data.flowNodeType);
    // 工具调用节点的工具选择边不算流程连线，否则挂了工具就永远不会被判定为孤立节点。
    const meaningfulOutgoingEdges =
      data.flowNodeType === FlowNodeTypeEnum.toolCall
        ? outgoingEdges.filter((edge) => edge.data.sourceHandle !== NodeOutputKeyEnum.selectedTools)
        : outgoingEdges;

    if (!isStartNode && incomingEdges.length === 0) {
      addIssue({ code: 'no_upstream' });
    } else if (!isStartNode && !reachableNodeIds.has(nodeId)) {
      addIssue({ code: 'unreachable_from_start' });
    } else if (incomingEdges.length === 0 && meaningfulOutgoingEdges.length === 0) {
      addIssue({ code: 'isolated_node' });
    }
  }

  return issues;
};

// endregion

// region configIssues Workflow configuration issue collection

/**
 * 工作流级问题：chatConfig 里的模型不属于任何画布节点，单独成桶。
 * 目录未就绪时跳过，与节点级模型规则保持一致。
 */
export const collectConfigIssues = ({
  document,
  environment
}: IssueRuleInput): WorkflowConfigIssue[] => {
  const models = environment.models;
  const chatConfig = document.getDocument().chatConfig;
  const issues: WorkflowConfigIssue[] = [];
  if (!models) return issues;

  const check = ({
    config,
    type,
    inputName,
    enabled
  }: {
    config?: { modelId?: unknown; model?: unknown };
    type: ModelTypeEnum;
    inputName: string;
    enabled: boolean;
  }) => {
    if (!enabled || !config) return;
    const value = getModelReferenceValue(config);
    if (isEmptyModelValue(value)) {
      // 该类型模型一个都没有时不要求配置，与节点级 defaultWhenEmpty 语义一致。
      if (models.some((item) => item.type === type)) return;
      issues.push({
        level: 'error',
        code: 'model_required',
        inputKey: inputName,
        params: { inputName }
      });
      return;
    }
    if (Array.isArray(value) || typeof value !== 'string') return;
    if (
      models.some((item) => item.type === type && (item.modelId === value || item.model === value))
    ) {
      return;
    }
    issues.push({
      level: 'error',
      code: 'model_unavailable_short',
      inputKey: inputName,
      params: { inputName }
    });
  };

  check({
    config: chatConfig?.questionGuide,
    type: ModelTypeEnum.llm,
    inputName: 'common:core.app.Question Guide',
    enabled: chatConfig?.questionGuide?.open === true
  });
  check({
    config: chatConfig?.ttsConfig,
    type: ModelTypeEnum.tts,
    inputName: 'common:core.app.tts.Speech model',
    enabled: chatConfig?.ttsConfig?.type === 'model'
  });
  return issues;
};

// endregion
