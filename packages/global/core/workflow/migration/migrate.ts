import type { CanonicalWorkflowData } from './schema';
import type { CanonicalAgentToolInputConfig } from './schema';
import { CanonicalSelectedToolsValueSchema, CanonicalWorkflowDataSchema } from './schema';
import type { LegacyWorkflowDataInput } from './legacy/schema';
import { migrateLegacyWorkflowStructureToCurrent } from './legacy/workflow';
import { migrateLegacyWorkflowStructureData } from './legacy/structure';
import { migrateWorkflowSecretValues } from './secret';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../node/constant';
import { NodeInputKeyEnum } from '../constants';
import { AgentToolInputModeEnum } from '../../app/tool/constants';
import { getAgentToolInputMode, isToolInputValueConfigured } from '../../app/formEdit/utils';

/**
 * 将外部 workflow 迁移为严格 canonical 数据。
 *
 * 工具输入只信任 JSON 中保存的 key/mode；工具 definition、权限和 schema 水合由边界层处理。
 */
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

const FLOW_NODE_INPUT_TYPES = new Set<string>(Object.values(FlowNodeInputTypeEnum));
const AGENT_TOOL_INPUT_MODES = new Set<string>(Object.values(AgentToolInputModeEnum));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** 历史 NodeIO 的 selectedType/renderTypeList 元素需要按枚举收窄后才能进入类型化 helper。 */
const isFlowNodeInputType = (value: unknown): value is FlowNodeInputTypeEnum =>
  typeof value === 'string' && FLOW_NODE_INPUT_TYPES.has(value);

const isAgentToolInputMode = (value: unknown): value is AgentToolInputModeEnum =>
  typeof value === 'string' && AGENT_TOOL_INPUT_MODES.has(value);

const readRenderTypeList = (value: unknown): FlowNodeInputTypeEnum[] =>
  Array.isArray(value) ? value.filter(isFlowNodeInputType) : [];

/**
 * 把历史完整 NodeIO 工具快照归一为 `{ key, mode }` 稀疏配置。
 *
 * 契约见 `core/app/tool/type.ts`：`inputs` 只保存字段关联与输入来源，完整 NodeIO 快照
 * 必须在 workflow migration 边界预处理。这里承担该职责，`mode` 按以下顺序确定：
 *
 * 1. 已保存的合法 `mode`（canonical 数据，保证幂等）；
 * 2. 历史 NodeIO 的显式来源（`selectedType` / `renderTypeList`）——与编辑器保存语义一致，
 *    显式选成手动类型的输入必须保留 manual，不能被下面的值推断覆盖；
 * 3. 两者都没有时才按「是否已配置固定值」推断，此时把 `config` 里的已存值也算作来源。
 *
 * 手工输入的固定值从 `input.value` 搬到 `config[key]`（已有 config 优先），其余 NodeIO
 * 字段（renderTypeList/selectedType/valueType/...）一律丢弃。
 */
export const normalizeAgentToolInputs = ({
  rawInputs,
  rawConfig
}: {
  rawInputs: unknown;
  rawConfig: unknown;
}): {
  inputs: CanonicalAgentToolInputConfig[];
  config: Record<string, unknown>;
} => {
  const config: Record<string, unknown> = isRecord(rawConfig) ? { ...rawConfig } : {};

  // inputs 缺失时从 config 推导输入来源，保持既有行为。
  const inputList: unknown[] = Array.isArray(rawInputs)
    ? rawInputs
    : Object.entries(config).map(([key, value]) => ({ key, value }));

  const seenKeys = new Set<string>();
  const inputs: CanonicalAgentToolInputConfig[] = [];

  inputList.forEach((rawInput) => {
    if (!isRecord(rawInput)) return;

    const key = typeof rawInput.key === 'string' ? rawInput.key : '';
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);

    const renderTypeList = readRenderTypeList(rawInput.renderTypeList);
    const selectedType = isFlowNodeInputType(rawInput.selectedType) ? rawInput.selectedType : undefined;
    const hasSourceType = selectedType !== undefined || renderTypeList.length > 0;
    // config 是普通对象，会继承 Object.prototype；只认自有字段，避免 toString/constructor
    // 这类合法参数名读到原型成员而被误判为「已保存值」。null 与 undefined 同样视为无值。
    const hasOwnConfigValue =
      Object.hasOwn(config, key) && config[key] !== undefined && config[key] !== null;
    const configuredValue = hasOwnConfigValue ? config[key] : rawInput.value;

    const mode: AgentToolInputModeEnum = isAgentToolInputMode(rawInput.mode)
      ? rawInput.mode
      : hasSourceType
        ? getAgentToolInputMode({ renderTypeList, selectedType })
        : isToolInputValueConfigured({
              input: {
                key,
                renderTypeList,
                selectedType,
                value: configuredValue,
                defaultValue: rawInput.defaultValue,
                // 该分支只处理「完全没有来源信息」的历史快照，不存在可用的 inputList。
                inputList: undefined
              }
            })
          ? AgentToolInputModeEnum.manual
          : AgentToolInputModeEnum.agentGenerated;

    // 固定值搬进 config；已有的非空 config 优先，不覆盖。
    if (mode === AgentToolInputModeEnum.manual && rawInput.value !== undefined && !hasOwnConfigValue) {
      // 直接赋值会把 `__proto__` 写进原型链而不是 config 自身，故显式定义为自有属性。
      Object.defineProperty(config, key, {
        value: rawInput.value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    }

    inputs.push({ key, mode });
  });

  return { inputs, config };
};

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

  const nodes = workflow.nodes.map((node) => {
    const nodeWithPasswordReference = {
      ...node,
      inputs: node.inputs.map((input) => {
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

  return CanonicalWorkflowDataSchema.parse({ ...workflow, nodes });
};
