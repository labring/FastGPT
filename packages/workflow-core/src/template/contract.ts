import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  isInteractiveNodeType,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';

export type NodeExecutionSourceKind =
  | 'next'
  | 'branch'
  | 'sourceOutput'
  | 'catch'
  | 'selectedTools';
export type NodeExecutionTargetKind = 'target' | 'selectedTools';

export type NodeRuntimeContract = {
  execution: {
    sourceKinds: NodeExecutionSourceKind[];
    targetKinds: NodeExecutionTargetKind[];
    terminal: boolean;
    branch?: {
      inputKey: string;
      keyField: 'branchId' | 'key';
      keyFieldRequiredForNewValues: boolean;
      fallbackKey?: string;
      configureBeforeConnect: true;
    };
  };
  dynamicIO: {
    inputs: {
      manual: boolean;
      derivedFromInputKeys: string[];
    };
    outputs: {
      manual: boolean;
      derivedFromInputKeys: string[];
    };
  };
  container: {
    kind: 'none' | 'parallel' | 'loop';
    rootAllowed: boolean;
    allowedParentTypes: string[];
  };
  effects: string[];
};

/** StoreNode 不持久化画布端口标记，静态校验按节点类型保留其固有出口限制。 */
export const NODE_TYPES_WITHOUT_NEXT_PORT: ReadonlySet<FlowNodeTypeEnum> = new Set([
  FlowNodeTypeEnum.emptyNode,
  FlowNodeTypeEnum.globalVariable,
  FlowNodeTypeEnum.comment,
  FlowNodeTypeEnum.ifElseNode,
  FlowNodeTypeEnum.userSelect,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.stopTool,
  FlowNodeTypeEnum.toolSet,
  FlowNodeTypeEnum.loopRunBreak,
  FlowNodeTypeEnum.nestedEnd,
  FlowNodeTypeEnum.pluginOutput
]);

/** 起始节点、注释和工具集没有普通执行入口；工具集仍可使用 selectedTools 入口。 */
export const NODE_TYPES_WITHOUT_TARGET_PORT: ReadonlySet<FlowNodeTypeEnum> = new Set([
  FlowNodeTypeEnum.emptyNode,
  FlowNodeTypeEnum.globalVariable,
  FlowNodeTypeEnum.comment,
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.nestedStart,
  FlowNodeTypeEnum.loopRunStart,
  FlowNodeTypeEnum.toolSet
]);

/** StoreNode 不持久化 isTool，挂载黑名单统一从模板推导；没有模板的编辑器类型也不可挂载。 */
export const NODE_TYPES_WITHOUT_TOOL_TARGET: ReadonlySet<FlowNodeTypeEnum> = new Set(
  Object.values(FlowNodeTypeEnum).filter(
    (flowNodeType) =>
      !moduleTemplatesFlat.some(
        (template) => template.flowNodeType === flowNodeType && template.isTool === true
      )
  )
);

export const DYNAMIC_OUTPUT_NODE_TYPES: ReadonlySet<FlowNodeTypeEnum> = new Set([
  FlowNodeTypeEnum.code,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.httpRequest468,
  FlowNodeTypeEnum.loopRun
]);

export const DYNAMIC_INPUT_MARKER_KEYS: ReadonlySet<string> = new Set([
  NodeInputKeyEnum.addInputParam,
  NodeInputKeyEnum.datasetQuoteList
]);

export const ROOT_ONLY_NODE_TYPES: ReadonlySet<FlowNodeTypeEnum> = new Set([
  FlowNodeTypeEnum.workflowStart,
  FlowNodeTypeEnum.loop,
  FlowNodeTypeEnum.loopRun,
  FlowNodeTypeEnum.parallelRun,
  FlowNodeTypeEnum.pluginInput,
  FlowNodeTypeEnum.pluginOutput,
  FlowNodeTypeEnum.globalVariable
]);

const CONTAINER_NODE_TYPES = [
  FlowNodeTypeEnum.loop,
  FlowNodeTypeEnum.parallelRun,
  FlowNodeTypeEnum.loopRun
];

const getNodePlacement = (flowNodeType: FlowNodeTypeEnum) => {
  if (flowNodeType === FlowNodeTypeEnum.loopRunBreak) {
    return { rootAllowed: false, allowedParentTypes: [FlowNodeTypeEnum.loopRun] };
  }
  if (isNestedChildSystemNodeType(flowNodeType)) {
    return { rootAllowed: false, allowedParentTypes: CONTAINER_NODE_TYPES };
  }
  if (ROOT_ONLY_NODE_TYPES.has(flowNodeType)) {
    return { rootAllowed: true, allowedParentTypes: [] };
  }
  return {
    rootAllowed: true,
    allowedParentTypes: isInteractiveNodeType(flowNodeType)
      ? [FlowNodeTypeEnum.loop, FlowNodeTypeEnum.loopRun]
      : CONTAINER_NODE_TYPES
  };
};

const getBranchContract = (flowNodeType: FlowNodeTypeEnum) => {
  if (flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    return {
      inputKey: NodeInputKeyEnum.ifElseList,
      keyField: 'branchId' as const,
      keyFieldRequiredForNewValues: true,
      fallbackKey: 'ELSE',
      configureBeforeConnect: true as const
    };
  }
  if (flowNodeType === FlowNodeTypeEnum.userSelect) {
    return {
      inputKey: NodeInputKeyEnum.userSelectOptions,
      keyField: 'key' as const,
      keyFieldRequiredForNewValues: true,
      configureBeforeConnect: true as const
    };
  }
  if (flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
    return {
      inputKey: NodeInputKeyEnum.agents,
      keyField: 'key' as const,
      keyFieldRequiredForNewValues: true,
      configureBeforeConnect: true as const
    };
  }
};

/**
 * 从模板和共享节点集合生成可供 Validator、CLI 和 Agent 共用的运行时契约。
 * 普通端口必须由模板显式开放；工具挂载读取注入模板的 isTool，兼容动态应用模板。
 * 类型集合限制固有端口，避免外部工具元数据重新开启工具集等节点的普通连线。
 */
export const getNodeRuntimeContract = (template: FlowNodeTemplateType): NodeRuntimeContract => {
  const flowNodeType = template.flowNodeType;
  // 弃用 IO 仅用于历史节点兼容，不向新建节点声明对应的执行端口和动态字段能力。
  const inputs = template.inputs.filter((input) => input.deprecated !== true);
  const outputs = template.outputs.filter((output) => output.deprecated !== true);
  const branch = getBranchContract(flowNodeType);
  const sourceKinds: NodeExecutionSourceKind[] = [
    !NODE_TYPES_WITHOUT_NEXT_PORT.has(flowNodeType) && template.showSourceHandle === true
      ? 'next'
      : undefined,
    branch ? 'branch' : undefined,
    outputs.some((output) => output.type === 'source') ? 'sourceOutput' : undefined,
    template.catchError !== undefined ? 'catch' : undefined,
    flowNodeType === FlowNodeTypeEnum.toolCall ? 'selectedTools' : undefined
  ].filter((kind): kind is NodeExecutionSourceKind => kind !== undefined);
  const targetKinds: NodeExecutionTargetKind[] = [
    !NODE_TYPES_WITHOUT_TARGET_PORT.has(flowNodeType) && template.showTargetHandle === true
      ? 'target'
      : undefined,
    template.isTool === true ? 'selectedTools' : undefined
  ].filter((kind): kind is NodeExecutionTargetKind => kind !== undefined);
  const dynamicInputs = inputs.some((input) => DYNAMIC_INPUT_MARKER_KEYS.has(input.key));
  const dynamicOutputs =
    DYNAMIC_OUTPUT_NODE_TYPES.has(flowNodeType) ||
    outputs.some((output) => output.key === 'system_addOutputParam');
  const derivedInputKeys = flowNodeType === FlowNodeTypeEnum.code ? [NodeInputKeyEnum.code] : [];
  const derivedOutputKeys =
    flowNodeType === FlowNodeTypeEnum.code
      ? [NodeInputKeyEnum.code]
      : flowNodeType === FlowNodeTypeEnum.formInput
        ? [NodeInputKeyEnum.userInputForms]
        : [];
  const effects = [
    branch ? 'prune-invalid-branch-edges' : undefined,
    flowNodeType === FlowNodeTypeEnum.code ? 'sync-code-inputs-and-outputs' : undefined,
    flowNodeType === FlowNodeTypeEnum.formInput ? 'sync-form-field-outputs' : undefined,
    isNestedParentNodeType(flowNodeType) ? 'sync-container-children' : undefined,
    dynamicOutputs ? 'prune-removed-output-edges' : undefined
  ].filter((effect): effect is string => effect !== undefined);
  const placement = getNodePlacement(flowNodeType);

  return {
    execution: {
      sourceKinds,
      targetKinds,
      terminal: sourceKinds.length === 0,
      branch
    },
    dynamicIO: {
      inputs: { manual: dynamicInputs, derivedFromInputKeys: derivedInputKeys },
      outputs: { manual: dynamicOutputs, derivedFromInputKeys: derivedOutputKeys }
    },
    container: {
      kind:
        flowNodeType === FlowNodeTypeEnum.parallelRun
          ? 'parallel'
          : flowNodeType === FlowNodeTypeEnum.loopRun
            ? 'loop'
            : 'none',
      ...placement
    },
    effects
  };
};
