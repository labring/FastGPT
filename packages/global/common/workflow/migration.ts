import type { CanonicalWorkflowData } from '../../core/workflow/migration/schema';
import {
  CanonicalSelectedToolsValueSchema,
  CanonicalWorkflowDataSchema
} from '../../core/workflow/migration/schema';
import type { LegacyWorkflowDataInput } from '../../core/workflow/migration/legacy/schema';
import { normalizeAgentToolInputs } from '../../core/workflow/migration/agentToolInput';
import { migrateLegacyWorkflowStructureToCurrent } from '../../core/workflow/migration/legacy/workflow';
import { migrateLegacyWorkflowStructureData } from '../../core/workflow/migration/legacy/structure';
import { migrateWorkflowSecretValues } from '../../core/workflow/migration/secret';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  isNestedParentNodeType
} from '../../core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '../../core/workflow/constants';
import type { FlowNodeInputItemType } from '../../core/workflow/type/io';
import type { StoreNodeItemType } from '../../core/workflow/type/node';
import {
  indexWorkflowReferenceSnapshotOutputs,
  isWorkflowArrayReferenceInput,
  isWorkflowReferenceItem
} from './reference';

const canvasSizeInputKeys = new Set<string>([
  NodeInputKeyEnum.nodeWidth,
  NodeInputKeyEnum.nodeHeight,
  NodeInputKeyEnum.nestedNodeInputHeight
]);

/** 只剥掉容器旧模板的隐藏尺寸字段，保留同名业务参数与未变化的输入数组。 */
export const stripCanvasSizeInputs = ({
  flowNodeType,
  inputs
}: Pick<StoreNodeItemType, 'flowNodeType' | 'inputs'>): FlowNodeInputItemType[] => {
  if (!isNestedParentNodeType(flowNodeType)) return inputs;

  const isLegacySizeInput = (input: FlowNodeInputItemType) =>
    canvasSizeInputKeys.has(input.key) &&
    input.label === '' &&
    input.canEdit !== true &&
    input.valueType === WorkflowIOValueTypeEnum.number &&
    input.renderTypeList.length === 1 &&
    input.renderTypeList[0] === FlowNodeInputTypeEnum.hidden &&
    (input.selectedType === undefined || input.selectedType === FlowNodeInputTypeEnum.hidden);

  return inputs.some(isLegacySizeInput)
    ? inputs.filter((input) => !isLegacySizeInput(input))
    : inputs;
};

/** 判断节点列表是否包含带 moduleId 但缺少有效 nodeId 的 V1 历史节点。 */
export const isLegacyV1Workflow = (nodes: unknown): boolean => {
  if (!Array.isArray(nodes)) return false;
  return nodes.some((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    const record = node as Record<string, unknown>;
    const hasModuleId = typeof record.moduleId === 'string' && record.moduleId.length > 0;
    const hasValidNodeId = typeof record.nodeId === 'string' && record.nodeId.length > 0;
    return hasModuleId && !hasValidNodeId;
  });
};

/** 在刚解析的图上升级快照确认的旧单引用，保留没有快照依据的字面数组。 */
export const normalizeWorkflowSnapshotArrayReferences = ({
  nodes,
  referenceSnapshots
}: Pick<CanonicalWorkflowData, 'nodes' | 'referenceSnapshots'>) => {
  if (referenceSnapshots.length === 0) return;
  const snapshotOutputIds = indexWorkflowReferenceSnapshotOutputs(referenceSnapshots);
  for (const { flowNodeType, inputs } of nodes) {
    for (const input of inputs) {
      if (!isWorkflowArrayReferenceInput(flowNodeType, input)) continue;
      for (const key of ['value', 'defaultValue'] as const) {
        const value: unknown = input[key];
        if (isWorkflowReferenceItem(value) && snapshotOutputIds.get(value[0])?.has(value[1])) {
          input[key] = [value];
        }
      }
    }
  }
};

/**
 * 将外部 workflow 迁移为严格 canonical 数据。
 *
 * 工具输入只信任 JSON 中保存的 key/mode；工具 definition、权限和 schema 水合由边界层处理。
 */
export const migrateWorkflowToCurrent = (input: LegacyWorkflowDataInput): CanonicalWorkflowData => {
  // V1 工作流已不再支持，普通入口只接受 V2/current 数据。
  if (isLegacyV1Workflow(input.nodes)) {
    throw new Error('V1 workflows are no longer supported');
  }

  const workflow = migrateWorkflowSecretValues(
    migrateLegacyWorkflowStructureToCurrent(
      migrateWorkflowSecretValues(
        migrateLegacyWorkflowStructureData({
          nodes: input.nodes,
          edges: input.edges,
          chatConfig: input.chatConfig
        })
      )
    )
  );

  const nodes = workflow.nodes.map((rawNode) => {
    const nodeWithPasswordReference = {
      ...rawNode,
      inputs: stripCanvasSizeInputs(rawNode).map((input) => {
        if (
          !input.renderTypeList.includes(FlowNodeInputTypeEnum.password) ||
          input.renderTypeList.includes(FlowNodeInputTypeEnum.reference)
        ) {
          return input;
        }

        // 新增引用能力不改变旧节点的默认模式和已保存的密码值。
        return {
          ...input,
          renderTypeList: [...input.renderTypeList, FlowNodeInputTypeEnum.reference]
        };
      })
    };

    if (nodeWithPasswordReference.flowNodeType !== FlowNodeTypeEnum.agent) {
      return nodeWithPasswordReference;
    }

    return {
      ...nodeWithPasswordReference,
      inputs: nodeWithPasswordReference.inputs.map((input) => {
        if (input.key !== NodeInputKeyEnum.selectedTools || !Array.isArray(input.value)) {
          return input;
        }

        const rawSelectedTools = input.value;
        // 工作流变量引用形态 `[nodeId, outputId]` 不是工具列表，原样保留。
        if (
          rawSelectedTools.length === 2 &&
          rawSelectedTools.every((item) => typeof item === 'string')
        ) {
          return input;
        }

        const value = rawSelectedTools.map((tool) => {
          if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return tool;

          const { config: rawConfig, inputs: rawInputs, ...availableTool } = tool;
          const { inputs, config } = normalizeAgentToolInputs({ rawInputs, rawConfig });

          return { ...availableTool, inputs, config };
        });

        return {
          ...input,
          value: CanonicalSelectedToolsValueSchema.parse(value)
        };
      })
    };
  });

  // 结构迁移只处理 nodes/edges/chatConfig，根级快照要显式带上，否则入站就被剥掉。
  const canonical = CanonicalWorkflowDataSchema.parse({
    ...workflow,
    nodes,
    referenceSnapshots: input.referenceSnapshots
  });
  normalizeWorkflowSnapshotArrayReferences(canonical);
  return canonical;
};
