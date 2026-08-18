import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../../constants';
import { getHandleId } from '../../utils';

type LegacyV1WorkflowNode = Record<string, unknown> & {
  moduleId?: string;
  flowType?: string;
  inputs?: Record<string, unknown>[];
  outputs?: Record<string, unknown>[];
};
type CopiedV1WorkflowNode = LegacyV1WorkflowNode & {
  moduleId: string;
  inputs: Record<string, unknown>[];
  outputs: Record<string, unknown>[];
};

const inputTypeMap: Record<string, FlowNodeInputTypeEnum> = {
  systemInput: FlowNodeInputTypeEnum.input,
  input: FlowNodeInputTypeEnum.input,
  numberInput: FlowNodeInputTypeEnum.numberInput,
  select: FlowNodeInputTypeEnum.select,
  target: FlowNodeInputTypeEnum.reference,
  switch: FlowNodeInputTypeEnum.switch,
  textarea: FlowNodeInputTypeEnum.textarea,
  JSONEditor: FlowNodeInputTypeEnum.JSONEditor,
  addInputParam: FlowNodeInputTypeEnum.addInputParam,
  selectApp: FlowNodeInputTypeEnum.selectApp,
  selectLLMModel: FlowNodeInputTypeEnum.selectLLMModel,
  settingLLMModel: FlowNodeInputTypeEnum.settingLLMModel,
  selectDataset: FlowNodeInputTypeEnum.selectDataset,
  selectDatasetParamsModal: FlowNodeInputTypeEnum.selectDatasetParamsModal,
  settingDatasetQuotePrompt: FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
  hidden: FlowNodeInputTypeEnum.hidden,
  custom: FlowNodeInputTypeEnum.custom
};
const outputTypeMap: Record<string, FlowNodeOutputTypeEnum> = {
  addOutputParam: FlowNodeOutputTypeEnum.dynamic,
  answer: FlowNodeOutputTypeEnum.static,
  source: FlowNodeOutputTypeEnum.static,
  hidden: FlowNodeOutputTypeEnum.hidden
};
const flowTypeMap: Record<string, FlowNodeTypeEnum | 'userGuide'> = {
  userGuide: 'userGuide',
  questionInput: FlowNodeTypeEnum.workflowStart,
  chatNode: FlowNodeTypeEnum.chatNode,
  datasetSearchNode: FlowNodeTypeEnum.datasetSearchNode,
  datasetConcatNode: FlowNodeTypeEnum.datasetConcatNode,
  answerNode: FlowNodeTypeEnum.answerNode,
  classifyQuestion: FlowNodeTypeEnum.classifyQuestion,
  contentExtract: FlowNodeTypeEnum.contentExtract,
  httpRequest468: FlowNodeTypeEnum.httpRequest468,
  app: FlowNodeTypeEnum.runApp,
  pluginModule: FlowNodeTypeEnum.pluginModule,
  pluginInput: FlowNodeTypeEnum.pluginInput,
  pluginOutput: FlowNodeTypeEnum.pluginOutput,
  cfr: FlowNodeTypeEnum.queryExtension,
  tools: FlowNodeTypeEnum.toolCall,
  stopTool: FlowNodeTypeEnum.stopTool
};
const legacyValueTypes: Record<string, WorkflowIOValueTypeEnum> = {
  chat_history: WorkflowIOValueTypeEnum.chatHistory,
  kb_quote: WorkflowIOValueTypeEnum.datasetQuote
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const normalizeValueType = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value === 'string' && legacyValueTypes[value]) return legacyValueTypes[value];
  return typeof value === 'string' && Object.values(WorkflowIOValueTypeEnum).includes(value as any)
    ? value
    : WorkflowIOValueTypeEnum.any;
};

/** Detect V1 nodes before V2 boundary parsing rejects their `flowType` shape. */
export const isLegacyV1WorkflowNodes = (nodes: unknown[]): nodes is LegacyV1WorkflowNode[] =>
  nodes.some(
    (node) =>
      isRecord(node) &&
      typeof node.flowType === 'string' &&
      (typeof node.moduleId === 'string' || typeof node.nodeId !== 'string')
  );

/** Convert historical V1 graph storage into the V2 shape consumed by later migration phases. */
export const migrateLegacyV1WorkflowToV2 = ({
  nodes,
  edges
}: {
  nodes: LegacyV1WorkflowNode[];
  edges: unknown;
}) => {
  const copiedNodes: CopiedV1WorkflowNode[] = nodes
    .map(
      (node, index) =>
        ({
          ...node,
          moduleId:
            typeof node.moduleId === 'string' && node.moduleId ? node.moduleId : `v1-${index}`,
          inputs: Array.isArray(node.inputs) ? node.inputs : [],
          outputs: Array.isArray(node.outputs) ? node.outputs : []
        }) as CopiedV1WorkflowNode
    )
    .filter(
      (node, index, all) =>
        node.flowType !== 'questionInput' ||
        index === all.findIndex((item) => item.flowType === 'questionInput')
    );
  const convertedNodes = copiedNodes.map((node) => {
    let pluginId: string | undefined;
    const inputs = node.inputs
      .map((input) => {
        const renderType = typeof input.type === 'string' ? inputTypeMap[input.type] : undefined;
        const renderTypeList = !input.type
          ? [FlowNodeInputTypeEnum.custom]
          : renderType
            ? [renderType]
            : [];
        if (input.key === 'pluginId' && typeof input.value === 'string') pluginId = input.value;
        return {
          ...input,
          selectedType: renderTypeList[0],
          renderTypeList,
          valueType: normalizeValueType(input.valueType),
          label:
            input.key === 'userChatInput'
              ? '问题输入'
              : input.key === 'quoteQA'
                ? ''
                : typeof input.label === 'string'
                  ? input.label
                  : String(input.key || ''),
          canEdit: input.edit
        } as Record<string, unknown>;
      })
      .filter(
        (input) =>
          Array.isArray(input.renderTypeList) &&
          input.renderTypeList.length > 0 &&
          ![
            'pluginId',
            'switch',
            'pluginStart',
            'DYNAMIC_INPUT_KEY',
            'system_addInputParam'
          ].includes(String(input.key))
      );
    const outputs = node.outputs
      .map((output) => ({
        id: output.key,
        type:
          typeof output.type === 'string'
            ? outputTypeMap[output.type] || FlowNodeOutputTypeEnum.static
            : FlowNodeOutputTypeEnum.static,
        key: output.key,
        valueType: normalizeValueType(output.valueType),
        label: typeof output.label === 'string' ? output.label : String(output.key || ''),
        description: output.description,
        required: output.required,
        defaultValue: output.defaultValue,
        canEdit: output.edit,
        editField: output.editField
      }))
      .filter(
        ({ key }) =>
          !['finish', 'isEmpty', 'unEmpty', 'pluginStart'].includes(String(key)) &&
          (node.flowType === 'questionInput' || key !== 'userChatInput') &&
          node.flowType !== 'pluginOutput' &&
          (node.flowType !== 'contentExtract' || !['success', 'failed'].includes(String(key)))
      );
    if (node.flowType === 'pluginOutput') {
      node.outputs.forEach((output) =>
        inputs.push({
          key: output.key,
          valueType: normalizeValueType(output.valueType),
          selectedType: FlowNodeInputTypeEnum.reference,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          label: typeof output.key === 'string' ? output.key : '',
          canEdit: true
        })
      );
    }
    return {
      nodeId: node.moduleId,
      position: node.position,
      flowNodeType: flowTypeMap[String(node.flowType)] || FlowNodeTypeEnum.emptyNode,
      avatar: node.flowType === 'pluginModule' ? node.avatar : undefined,
      name:
        node.flowType === 'questionInput'
          ? '流程开始'
          : typeof node.name === 'string'
            ? node.name
            : String(node.flowType || ''),
      intro: node.intro,
      showStatus: node.showStatus,
      pluginId,
      parentId: node.parentId,
      version: '481',
      inputs,
      outputs
    };
  });
  const convertedEdges = copiedNodes.flatMap((node) =>
    node.outputs.flatMap((output) => {
      const targets = Array.isArray(output.targets) ? output.targets : [];
      return targets.flatMap((target) => {
        if (!isRecord(target) || typeof target.moduleId !== 'string') return [];
        if (
          ['finish', 'isEmpty', 'unEmpty'].includes(String(output.key)) ||
          (node.flowType !== 'questionInput' && output.key === 'userChatInput') ||
          node.flowType === 'contentExtract'
        ) {
          return [];
        }
        if (output.key === NodeOutputKeyEnum.selectedTools) {
          return [
            {
              source: node.moduleId,
              sourceHandle: NodeOutputKeyEnum.selectedTools,
              target: target.moduleId,
              targetHandle: NodeOutputKeyEnum.selectedTools
            }
          ];
        }
        return [
          {
            source: node.moduleId,
            sourceHandle:
              node.flowType === 'classifyQuestion'
                ? getHandleId(node.moduleId, 'source', String(output.key))
                : getHandleId(node.moduleId, 'source', 'right'),
            target: target.moduleId,
            targetHandle: getHandleId(target.moduleId, 'target', 'left')
          }
        ];
      });
    })
  );
  const uniqueEdges = convertedEdges.filter(
    (edge, index, all) =>
      index === all.findIndex((item) => item.source === edge.source && item.target === edge.target)
  );
  const workflowStart = convertedNodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
  );
  copiedNodes.forEach((node) =>
    node.outputs.forEach((output) =>
      (Array.isArray(output.targets) ? output.targets : []).forEach((target) => {
        if (!isRecord(target) || typeof target.moduleId !== 'string') return;
        const input = convertedNodes
          .find((item) => item.nodeId === target.moduleId)
          ?.inputs.find((item) => item.key === target.key);
        if (input) input.value = [node.moduleId, output.key];
      })
    )
  );
  convertedNodes.forEach((node) =>
    node.inputs.forEach((input) => {
      if (!workflowStart) return;
      if (
        node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode &&
        input.key === NodeInputKeyEnum.datasetSearchInput
      ) {
        input.value = [
          [workflowStart.nodeId, NodeOutputKeyEnum.userChatInput],
          [workflowStart.nodeId, NodeOutputKeyEnum.userFiles]
        ];
        input.valueType = WorkflowIOValueTypeEnum.arrayString;
      } else if (input.key === NodeInputKeyEnum.userChatInput) {
        input.value = [workflowStart.nodeId, NodeOutputKeyEnum.userChatInput];
      }
    })
  );
  return { nodes: convertedNodes, edges: Array.isArray(edges) ? uniqueEdges : uniqueEdges };
};
