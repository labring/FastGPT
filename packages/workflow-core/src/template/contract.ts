import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeTypeEnum,
  isInteractiveNodeType,
  isNestedChildSystemNodeType,
  isNestedParentNodeType
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

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

export const NODE_TYPES_WITHOUT_NEXT_PORT: ReadonlySet<FlowNodeTypeEnum> = new Set([
  FlowNodeTypeEnum.ifElseNode,
  FlowNodeTypeEnum.userSelect,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.answerNode,
  FlowNodeTypeEnum.loopRunBreak,
  FlowNodeTypeEnum.nestedEnd,
  FlowNodeTypeEnum.pluginOutput
]);

export const TOOL_TARGET_NODE_TYPES: ReadonlySet<FlowNodeTypeEnum> = new Set([
  FlowNodeTypeEnum.tool,
  FlowNodeTypeEnum.toolSet,
  FlowNodeTypeEnum.pluginModule,
  FlowNodeTypeEnum.appModule,
  FlowNodeTypeEnum.runApp,
  FlowNodeTypeEnum.chatNode,
  FlowNodeTypeEnum.answerNode,
  FlowNodeTypeEnum.datasetSearchNode,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.httpRequest468,
  FlowNodeTypeEnum.toolParams,
  FlowNodeTypeEnum.userSelect,
  FlowNodeTypeEnum.formInput,
  FlowNodeTypeEnum.variableUpdate
]);

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
 * 模板展示字段只决定当前节点实例是否开放 target/catch；节点类型集合承载稳定领域规则。
 */
export const getNodeRuntimeContract = (template: FlowNodeTemplateType): NodeRuntimeContract => {
  const flowNodeType = template.flowNodeType;
  const branch = getBranchContract(flowNodeType);
  const sourceKinds: NodeExecutionSourceKind[] = [
    !NODE_TYPES_WITHOUT_NEXT_PORT.has(flowNodeType) && template.showSourceHandle !== false
      ? 'next'
      : undefined,
    branch ? 'branch' : undefined,
    template.outputs.some((output) => output.type === 'source') ? 'sourceOutput' : undefined,
    template.catchError !== undefined ? 'catch' : undefined,
    flowNodeType === FlowNodeTypeEnum.toolCall ? 'selectedTools' : undefined
  ].filter((kind): kind is NodeExecutionSourceKind => kind !== undefined);
  const targetKinds: NodeExecutionTargetKind[] = [
    template.showTargetHandle !== false ? 'target' : undefined,
    TOOL_TARGET_NODE_TYPES.has(flowNodeType) ? 'selectedTools' : undefined
  ].filter((kind): kind is NodeExecutionTargetKind => kind !== undefined);
  const dynamicInputs = template.inputs.some((input) => DYNAMIC_INPUT_MARKER_KEYS.has(input.key));
  const dynamicOutputs =
    DYNAMIC_OUTPUT_NODE_TYPES.has(flowNodeType) ||
    template.outputs.some((output) => output.key === 'system_addOutputParam');
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
