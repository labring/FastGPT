import type { CanonicalWorkflowData } from '../schema';
import { CanonicalWorkflowDataSchema } from '../schema';
import type { LegacyWorkflowDataInput } from './schema';
import { LegacyWorkflowDataSchema } from './schema';
import {
  migrateLegacyFlowNodeInputToCurrent,
  migrateLegacyHttpToolInputDefaultMode,
  migrateLegacyWorkflowToolInputDefaultMode
} from './input';
import { migrateSystemConfigToChatConfig } from './systemConfig';
import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import { NodeInputKeyEnum, NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../../constants';
import { StoreSecretValueTypeSchema } from '../../../../common/secret/type';
import {
  getElseIFLabel,
  getHandleId,
  isValidReferenceValueFormat,
  nodeInputIsReference
} from '../../utils';

// 这些旧插件没有持久化 catchError，但当前运行时需要显式开启错误分支。
const legacyCatchErrorPluginIds = new Set([
  'systemTool-dalle3',
  'systemTool-aliModelStudio/flux',
  'systemTool-aliModelStudio/wanxTxt2ImgV2',
  'systemTool-blackForestLab/kontextEditing',
  'systemTool-blackForestLab/kontextGeneration',
  'systemTool-bocha',
  'systemTool-searchXNG'
]);

/** 将画布层曾承担的结构兼容集中到 migration。 */
const migrateLegacyCanvasStructure = (workflow: CanonicalWorkflowData): CanonicalWorkflowData => {
  const branchHandleMap = new Map<string, string>();
  const catchErrorNodeIds = new Set<string>();
  const nodes = workflow.nodes.map((node) => {
    // 旧 MCP ToolSet 把配置直接塞在第一个输入的 value 中；当前结构统一放到 toolConfig。
    const legacyToolSetValue = node.inputs[0]?.value;
    const shouldMigrateLegacyMcpToolSet =
      node.flowNodeType === FlowNodeTypeEnum.toolSet &&
      !node.toolConfig?.mcpToolSet &&
      !node.toolConfig?.httpToolSet &&
      !node.toolConfig?.systemToolSet &&
      !!node.pluginId &&
      !!legacyToolSetValue &&
      typeof legacyToolSetValue === 'object' &&
      !Array.isArray(legacyToolSetValue);
    const legacyMcpToolSet = shouldMigrateLegacyMcpToolSet
      ? (legacyToolSetValue as Record<string, unknown>)
      : undefined;
    const legacyHeaderSecret = StoreSecretValueTypeSchema.safeParse(legacyMcpToolSet?.headerSecret);
    const inputs = node.inputs.map((input) => {
      // 文件列表实际是 JSON 数组；旧的单行 input 控件会导致编辑和解析类型不匹配。
      if (
        (node.flowNodeType === FlowNodeTypeEnum.chatNode ||
          node.flowNodeType === FlowNodeTypeEnum.toolCall) &&
        input.key === NodeInputKeyEnum.fileUrlList &&
        input.renderTypeList.includes(FlowNodeInputTypeEnum.input)
      ) {
        return {
          ...input,
          renderTypeList: input.renderTypeList.map((type) =>
            type === FlowNodeInputTypeEnum.input ? FlowNodeInputTypeEnum.JSONEditor : type
          ),
          selectedType:
            input.selectedType === FlowNodeInputTypeEnum.input
              ? FlowNodeInputTypeEnum.JSONEditor
              : input.selectedType
        };
      }

      if (
        node.flowNodeType === FlowNodeTypeEnum.ifElseNode &&
        input.key === NodeInputKeyEnum.ifElseList
      ) {
        const list = Array.isArray(input.value) ? input.value : [];
        const branchIds = new Set<string>();
        return {
          ...input,
          value: list.map((item, index) => {
            // 旧分支可能没有 branchId，或多个分支复用了同一个 ID；这里生成稳定且唯一的 ID。
            const baseBranchId =
              item && typeof item === 'object' && typeof item.branchId === 'string'
                ? item.branchId
                : getElseIFLabel(index);
            const branchId = branchIds.has(baseBranchId)
              ? `${baseBranchId}-${index}`
              : baseBranchId;
            branchIds.add(branchId);
            // 分支 ID 改变后，旧 edge 的 sourceHandle 也必须在下面同步替换。
            branchHandleMap.set(
              getHandleId(node.nodeId, 'source', getElseIFLabel(index)),
              getHandleId(node.nodeId, 'source', branchId)
            );
            return { ...item, branchId };
          })
        };
      }

      if (
        node.flowNodeType === FlowNodeTypeEnum.agent &&
        input.selectedType === undefined &&
        [
          NodeInputKeyEnum.skills,
          NodeInputKeyEnum.selectedTools,
          NodeInputKeyEnum.datasetSelectList
        ].includes(input.key as NodeInputKeyEnum)
      ) {
        // 旧 Agent 资源输入没有 selectedType 时默认使用第一个手动选择模式；引用值不能继续保留。
        return {
          ...input,
          selectedType: input.renderTypeList[0],
          value: nodeInputIsReference(input) ? [] : input.value
        };
      }

      if (
        node.flowNodeType === FlowNodeTypeEnum.datasetSearchNode &&
        input.key === NodeInputKeyEnum.userChatInput
      ) {
        // 旧 Dataset Search 复用了 userChatInput；当前使用数组输入，展示 label 由画布 hydration 从模板补齐。
        const isReferenceValue = isValidReferenceValueFormat(input.value);
        return {
          ...input,
          key: NodeInputKeyEnum.datasetSearchInput,
          value: isReferenceValue ? [input.value] : input.value,
          valueType: WorkflowIOValueTypeEnum.arrayString,
          selectedType: isReferenceValue
            ? FlowNodeInputTypeEnum.reference
            : FlowNodeInputTypeEnum.input
        };
      }

      return input;
    });

    // 缺少 catchError 的旧代码、HTTP 和部分系统插件需要补出 catch 分支。
    const requiresCatchError =
      node.catchError === undefined &&
      (node.flowNodeType === FlowNodeTypeEnum.code ||
        node.flowNodeType === FlowNodeTypeEnum.httpRequest468 ||
        (node.pluginId !== undefined && legacyCatchErrorPluginIds.has(node.pluginId)));
    if (requiresCatchError) catchErrorNodeIds.add(node.nodeId);
    return {
      ...node,
      inputs: shouldMigrateLegacyMcpToolSet ? inputs.slice(1) : inputs,
      ...(legacyMcpToolSet
        ? {
            toolConfig: {
              ...node.toolConfig,
              mcpToolSet: {
                url: typeof legacyMcpToolSet.url === 'string' ? legacyMcpToolSet.url : '',
                ...(legacyHeaderSecret.success ? { headerSecret: legacyHeaderSecret.data } : {}),
                toolList: Array.isArray(legacyMcpToolSet.toolList) ? legacyMcpToolSet.toolList : []
              }
            }
          }
        : {}),
      ...(requiresCatchError
        ? { catchError: true }
        : node.catchError === undefined && node.pluginId
          ? { catchError: false }
          : {})
    };
  });
  // 分支 ID 迁移只影响 sourceHandle；先重写已有边，再基于当前节点补 catch 边。
  const edgeKeys = new Set(
    workflow.edges.map((edge) => {
      const sourceHandle = branchHandleMap.get(edge.sourceHandle) ?? edge.sourceHandle;
      return `${edge.source}|${sourceHandle}|${edge.target}|${edge.targetHandle}`;
    })
  );
  const edges = workflow.edges.map((edge) => ({
    ...edge,
    sourceHandle: branchHandleMap.get(edge.sourceHandle) ?? edge.sourceHandle
  }));
  nodes.forEach((node) => {
    if (!catchErrorNodeIds.has(node.nodeId)) return;
    workflow.edges
      .filter((edge) => edge.source === node.nodeId)
      .forEach((edge) => {
        // catch 边复用原目标，仅把 sourceHandle 切换到统一的 source_catch/right。
        const sourceHandle = getHandleId(edge.source, 'source_catch', 'right');
        const key = `${edge.source}|${sourceHandle}|${edge.target}|${edge.targetHandle}`;
        if (edgeKeys.has(key)) return;
        edgeKeys.add(key);
        edges.push({ ...edge, sourceHandle });
      });
  });

  return { ...workflow, nodes, edges };
};
/**
 * 将无需资源解析的历史结构收敛为当前 workflow 结构。
 * Agent 工具缺失 inputs 的补全由上层统一入口通过 resolver 处理。
 */
export const migrateLegacyWorkflowStructureToCurrent = (
  input: LegacyWorkflowDataInput
): CanonicalWorkflowData => {
  // 先把输入收敛到只允许历史字段的边界，避免后续迁移函数处理任意脏数据。
  const legacy = LegacyWorkflowDataSchema.parse(input);
  // 废弃的系统配置节点需要先合并到 chatConfig，再从画布中移除。
  const workflow = migrateSystemConfigToChatConfig(legacy);
  // 工具节点由 selectedTools 边识别，后续输入迁移需要据此决定默认来源。
  const toolNodeIds = new Set(
    workflow.edges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );
  const migrated = {
    ...workflow,
    nodes: workflow.nodes.map((node) => {
      const isTool = toolNodeIds.has(node.nodeId);
      // 只有真实工具输入才使用旧 toolDescription 推断 isToolParam，避免普通节点误判。
      const allowLegacyToolDescriptionFallback =
        isTool &&
        (node.flowNodeType === FlowNodeTypeEnum.pluginModule ||
          !!node.toolConfig?.systemTool ||
          !!node.pluginId?.startsWith('systemTool-') ||
          !!node.pluginId?.startsWith('commercial-'));
      const inputs = node.inputs.map((input) =>
        migrateLegacyFlowNodeInputToCurrent(
          // HTTP 468 的旧默认模式规则与普通工作流输入不同，先单独恢复再做通用归一。
          node.flowNodeType === FlowNodeTypeEnum.httpRequest468
            ? migrateLegacyHttpToolInputDefaultMode(input)
            : input,
          { isTool, allowLegacyToolDescriptionFallback }
        )
      );

      const migratedInputs =
        node.flowNodeType === FlowNodeTypeEnum.agent
          ? inputs.map((input) => {
              const isManualSelectionInput = [
                NodeInputKeyEnum.skills,
                NodeInputKeyEnum.selectedTools,
                NodeInputKeyEnum.datasetSelectList
              ].includes(input.key as NodeInputKeyEnum);
              const sourceInput = node.inputs.find(({ key }) => key === input.key);
              if (!isManualSelectionInput || sourceInput?.selectedType !== undefined) {
                return input;
              }
              // 旧 Agent 资源输入没有保存选择模式；引用型历史值已无法解析，回退为空手动选择。
              return {
                ...input,
                selectedType: input.renderTypeList[0],
                value: nodeInputIsReference(input) ? [] : input.value
              };
            })
          : inputs;

      if (node.flowNodeType !== FlowNodeTypeEnum.pluginInput) {
        return { ...node, inputs: migratedInputs };
      }

      // pluginInput 是工具定义的边界：当前只允许手动/引用模式，不把 agentGenerated 持久化回节点。
      const normalizedInputs = migratedInputs
        .map(migrateLegacyWorkflowToolInputDefaultMode)
        .map((input) => {
          const renderTypeList = (input.renderTypeList ?? []).filter(
            (type) => type !== FlowNodeInputTypeEnum.agentGenerated
          );
          return {
            ...input,
            renderTypeList,
            selectedType:
              input.selectedType === FlowNodeInputTypeEnum.agentGenerated
                ? renderTypeList[0]
                : input.selectedType
          };
        });

      return { ...node, inputs: normalizedInputs };
    })
  };

  // 所有历史规则完成后再做 canonical 校验，保证调用方只拿到当前结构。
  return CanonicalWorkflowDataSchema.parse(
    migrateLegacyCanvasStructure(migrated as CanonicalWorkflowData)
  );
};
