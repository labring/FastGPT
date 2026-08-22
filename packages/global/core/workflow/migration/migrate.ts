import type { CanonicalWorkflowData, CanonicalAgentToolInputConfig } from './schema';
import {
  AgentToolInputBoundarySchema,
  CanonicalAgentToolInputConfigSchema,
  CanonicalSelectedToolsValueSchema,
  CanonicalWorkflowDataSchema
} from './schema';
import type { LegacyWorkflowDataInput } from './legacy/schema';
import type { WorkflowMigrationOptions } from './type';
import { migrateLegacyWorkflowStructureToCurrent } from './legacy/workflow';
import { LegacyAgentToolInputConfigSchema } from './legacy/schema';
import { migrateLegacyWorkflowStructureData } from './legacy/structure';
import { FlowNodeTypeEnum } from '../node/constant';
import { NodeInputKeyEnum } from '../constants';
import { AgentToolInputModeEnum } from '../../app/tool/constants';
import { canInputBeAgentGenerated } from '../../app/formEdit/utils';

/**
 * 将外部 workflow 迁移为严格 canonical 数据。
 *
 * 当前工具定义可得时，按定义修复每个输入；定义不可得时保留 unavailable 占位和可转换输入配置。
 * 所有结构兼容规则都在本模块的内部 phase 完成；调用者只接收经过 strict schema 校验的结果。
 */
export const migrateWorkflowToCurrent = async (
  input: LegacyWorkflowDataInput,
  options: WorkflowMigrationOptions = {}
): Promise<CanonicalWorkflowData> => {
  // V1 工作流已不再支持，普通入口只接受 V2/current 数据。
  const hasLegacyV1Node = input.nodes.some(
    (node) =>
      !!node &&
      typeof node === 'object' &&
      typeof (node as Record<string, unknown>).flowType === 'string' &&
      (typeof (node as Record<string, unknown>).moduleId === 'string' ||
        typeof (node as Record<string, unknown>).nodeId !== 'string')
  );
  if (hasLegacyV1Node) {
    throw new Error('V1 workflows are no longer supported');
  }

  const workflow = migrateLegacyWorkflowStructureToCurrent(
    migrateLegacyWorkflowStructureData({
      nodes: input.nodes,
      edges: input.edges,
      chatConfig: input.chatConfig
    })
  );
  if (options.migrateAgentTools === false) {
    return CanonicalWorkflowDataSchema.parse(workflow);
  }
  const nodes = await Promise.all(
    workflow.nodes.map(async (node) => {
      if (node.flowNodeType !== FlowNodeTypeEnum.agent) return node;

      const inputs = await Promise.all(
        node.inputs.map(async (input) => {
          if (input.key !== NodeInputKeyEnum.selectedTools || !Array.isArray(input.value)) {
            return input;
          }

          const value = await Promise.all(
            input.value.map(async (tool) => {
              if (!tool || typeof tool !== 'object' || typeof tool.id !== 'string') return tool;

              const config =
                tool.config && typeof tool.config === 'object' && !Array.isArray(tool.config)
                  ? tool.config
                  : {};

              const hasSavedInputs = Array.isArray(tool.inputs);
              const savedInputs: unknown[] = hasSavedInputs ? tool.inputs : [];
              const hasInputPayload = hasSavedInputs;
              const needsDefinition =
                tool.isUnavailable === true ||
                !hasSavedInputs ||
                savedInputs.some(
                  (item) => !CanonicalAgentToolInputConfigSchema.safeParse(item).success
                );
              const definition = needsDefinition
                ? await options.resolveToolDefinition?.({
                    id: tool.id,
                    version: typeof tool.version === 'string' ? tool.version : undefined,
                    source: typeof tool.source === 'string' ? tool.source : undefined
                  })
                : undefined;
              if (!needsDefinition) {
                const { isUnavailable: _isUnavailable, config: _config, ...availableTool } = tool;
                return {
                  ...availableTool,
                  config,
                  inputs: savedInputs.map((input) =>
                    CanonicalAgentToolInputConfigSchema.parse(input)
                  )
                };
              }

              if (!definition) {
                const preservedInputs = savedInputs.flatMap((input) => {
                  const result = AgentToolInputBoundarySchema.safeParse(input);
                  return result.success ? [result.data] : [];
                });
                const { inputs: _inputs, config: _config, ...unavailableTool } = tool;

                return {
                  ...unavailableTool,
                  // 无 definition 时不猜测 NodeIO 的 mode，也不复制其中的敏感 value 到 config。
                  // 工具恢复后再按当前 definition 转换，避免引入第二份输入载荷。
                  config,
                  isUnavailable: true,
                  ...(hasInputPayload ? { inputs: preservedInputs } : {})
                };
              }

              // 没有保存过 inputs 表示“未设置覆盖”，不能物化成当前 definition 的完整 key 列表。
              if (!hasInputPayload) {
                const { isUnavailable: _isUnavailable, config: _config, ...availableTool } = tool;
                return {
                  ...availableTool,
                  config
                };
              }

              const savedInputMap = new Map<string, CanonicalAgentToolInputConfig | undefined>(
                savedInputs.flatMap(
                  (input): Array<readonly [string, CanonicalAgentToolInputConfig | undefined]> => {
                    const result = LegacyAgentToolInputConfigSchema.safeParse(input);
                    if (result.success) return [[result.data.key, result.data] as const];
                    if (!input || typeof input !== 'object' || Array.isArray(input)) return [];

                    const key = (input as Record<string, unknown>).key;
                    return typeof key === 'string' ? [[key, undefined] as const] : [];
                  }
                )
              );
              const definitionInputMap = new Map(
                definition.inputs.map((definitionInput) => [definitionInput.key, definitionInput])
              );
              const migratedInputs: CanonicalAgentToolInputConfig[] = Array.from(
                savedInputMap.entries()
              ).flatMap(([key, savedInput]) => {
                const definitionInput = definitionInputMap.get(key);
                if (!definitionInput) return [];

                return [
                  {
                    key,
                    mode:
                      savedInput?.mode === AgentToolInputModeEnum.agentGenerated &&
                      !canInputBeAgentGenerated(definitionInput)
                        ? AgentToolInputModeEnum.manual
                        : (savedInput?.mode ??
                          (definitionInput.defaultToAgentGenerated === true
                            ? AgentToolInputModeEnum.agentGenerated
                            : AgentToolInputModeEnum.manual))
                  }
                ];
              });
              // V1 快照把手动参数存在完整 NodeIO 的 value 中；V2 只保存 key/mode，
              // 所以必须在此把仍为手动模式的值迁入 config。
              const legacyConfig = Object.fromEntries(
                migratedInputs.flatMap(({ key, mode }) => {
                  if (mode !== AgentToolInputModeEnum.manual) return [];

                  const savedInput = savedInputs.find((input) => {
                    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
                    return (input as Record<string, unknown>).key === key;
                  }) as Record<string, unknown> | undefined;
                  if (!savedInput) return [];

                  const hasValue = Object.prototype.hasOwnProperty.call(savedInput, 'value');
                  const hasDefaultValue = Object.prototype.hasOwnProperty.call(
                    savedInput,
                    'defaultValue'
                  );
                  if (!hasValue && !hasDefaultValue) return [];

                  return [[key, hasValue ? savedInput.value : savedInput.defaultValue]];
                })
              );
              const { isUnavailable: _isUnavailable, config: _config, ...availableTool } = tool;

              return {
                ...availableTool,
                // config 是当前 Agent 持久化字段，优先于旧 NodeIO 快照中的 value。
                config: { ...legacyConfig, ...config },
                inputs: migratedInputs
              };
            })
          );

          return { ...input, value };
        })
      );

      return { ...node, inputs };
    })
  );

  const canonicalNodes = nodes.map((node) => {
    if (node.flowNodeType !== FlowNodeTypeEnum.agent) return node;

    return {
      ...node,
      inputs: node.inputs.map((input) =>
        input.key === NodeInputKeyEnum.selectedTools && input.value !== undefined
          ? { ...input, value: CanonicalSelectedToolsValueSchema.parse(input.value) }
          : input
      )
    };
  });

  return CanonicalWorkflowDataSchema.parse({ ...workflow, nodes: canonicalNodes });
};
