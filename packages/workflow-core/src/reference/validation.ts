import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import {
  VARIABLE_NODE_ID,
  type WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  areWorkflowValueTypesCompatible,
  DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES,
  filterSelectableWorkflowNodeOutputs,
  getWorkflowReferenceItems,
  getWorkflowReferenceVariables
} from '@fastgpt/global/common/workflow/reference';
import type { WorkflowDiagnostic } from '../domain/diagnostic';
import { hasConfiguredValue } from '../template/defaultValue';
import { resolveWorkflowDocumentOutput } from './codec';
import { isWorkflowInputReferenceForValidation } from '../template/inputValue';
import {
  createWorkflowReferenceIndex,
  getInputReferenceSourceNodes,
  isWorkflowReferenceOutputUpstream,
  getWorkflowReferenceValues,
  isWorkflowReferenceValue,
  type WorkflowReferenceValue
} from './service';

export type WorkflowInvalidReferencePolicy = 'error' | 'asEmpty';

type InputReferenceContext = {
  document: WorkflowDocument;
  nodeId: string;
  input: FlowNodeInputItemType;
};

/** 校验已解析的引用，作用域和错误分支索引延迟计算并在同一输入内共享。 */
const createInputReferenceCheck = ({
  document,
  nodeId,
  input,
  excludeValueTypes
}: InputReferenceContext & {
  excludeValueTypes?: readonly WorkflowIOValueTypeEnum[];
}) => {
  let sourceNodeIds: Set<string> | undefined;
  let referenceIndex: ReturnType<typeof createWorkflowReferenceIndex> | undefined;
  let variables: ReturnType<typeof getWorkflowReferenceVariables> | undefined;
  return ([sourceNodeId, outputKey]: WorkflowReferenceValue): WorkflowDiagnostic[] => {
    const diagnostics: WorkflowDiagnostic[] = [];
    const sourceNode = document.nodes.find((node) => node.nodeId === sourceNodeId);
    const nodeOutput =
      sourceNode && resolveWorkflowDocumentOutput(sourceNode.outputs, outputKey).output;
    const sourceOutput =
      sourceNodeId === VARIABLE_NODE_ID
        ? (variables ??= getWorkflowReferenceVariables({ chatConfig: document.chatConfig })).find(
            (item) => item.key === outputKey
          )
        : nodeOutput;
    if (
      !sourceOutput ||
      (sourceNode &&
        nodeOutput &&
        !filterSelectableWorkflowNodeOutputs({
          outputs: sourceNode.outputs,
          catchError: sourceNode.catchError
        }).includes(nodeOutput))
    ) {
      diagnostics.push({
        code: WorkflowDiagnosticCodeEnum.referenceOutputNotFound,
        severity: 'error',
        nodeId,
        inputKey: input.key,
        params: { sourceNodeId, outputKey }
      });
      return diagnostics;
    }
    if (
      (sourceOutput.valueType !== undefined &&
        excludeValueTypes?.includes(sourceOutput.valueType)) ||
      !areWorkflowValueTypesCompatible({
        expected: input.valueType,
        actual: sourceOutput.valueType
      })
    ) {
      diagnostics.push({
        code: WorkflowDiagnosticCodeEnum.referenceTypeMismatch,
        severity: 'error',
        nodeId,
        inputKey: input.key,
        params: { expected: input.valueType, actual: sourceOutput.valueType }
      });
    }
    if (sourceNodeId === VARIABLE_NODE_ID) return diagnostics;

    referenceIndex ??= createWorkflowReferenceIndex(document);
    sourceNodeIds ??= new Set(
      getInputReferenceSourceNodes({ referenceIndex, nodeId, input }).map((source) => source.nodeId)
    );
    const isErrorOutput =
      'type' in sourceOutput && sourceOutput.type === FlowNodeOutputTypeEnum.error;
    if (
      !sourceNodeIds.has(sourceNodeId) ||
      (isErrorOutput &&
        !isWorkflowReferenceOutputUpstream({
          referenceIndex,
          nodeId,
          sourceNodeId,
          isErrorOutput,
          allowLoopRunChildSource: input.canEdit === true && sourceNode?.catchError === true
        }))
    ) {
      diagnostics.push({
        code: WorkflowDiagnosticCodeEnum.referenceSourceNotUpstream,
        severity: 'error',
        nodeId,
        inputKey: input.key,
        params: {
          sourceNodeId,
          outputKey,
          targetNodeId: nodeId,
          reason:
            sourceNodeId === nodeId
              ? 'Self-reference is not allowed'
              : 'Source output is outside the reference scope of the target input.',
          remediation:
            "For nodes in the same scope, connect the upstream source using 'edge.connect' before referencing it. Otherwise use a visible parent-container source; container outputs may reference their own children. Do not add cross-scope execution edges."
        }
      });
    }
    return diagnostics;
  };
};

/**
 * 统一检查输入引用的格式、来源、类型和作用域，兼容 Document 的 output key 与画布的 output id。
 * 只返回诊断，不修改输入；严格校验和客户端的有效值归一化共用此规则。
 * 调用方传入引用选择器或旧版整项标签筛选引用；文本插值由编辑器独立提示。
 */
export const getWorkflowInputReferenceDiagnostics = (
  context: InputReferenceContext
): WorkflowDiagnostic[] => {
  const { nodeId, input } = context;
  const references = getWorkflowReferenceValues(input.value);
  if (!references) {
    return [
      {
        code: WorkflowDiagnosticCodeEnum.referenceFormatInvalid,
        severity: 'error',
        nodeId,
        inputKey: input.key
      }
    ];
  }
  return references.flatMap(createInputReferenceCheck(context));
};

/** 动态选项每组至少保留一个可选引用，同一输入的多组表单项可共用检查。 */
export const createDynamicOptionReferenceCheck = (context: InputReferenceContext) => {
  const checkReference = createInputReferenceCheck({
    ...context,
    excludeValueTypes: DYNAMIC_OPTION_EXCLUDED_VALUE_TYPES
  });
  return (value: unknown) =>
    getWorkflowReferenceItems(value).some((reference) => checkReference(reference).length === 0);
};

/**
 * 按检查场景生成有效值快照：AI 保留失效引用报错，客户端将普通引用视为未引用，多引用只保留有效项。
 * 处理引用选择器和旧版整项标签筛选引用；文本插值及结构化 Secret 引用原样保留。
 * 调用方必须显式传入策略，避免共享入口因遗漏场景而使用错误语义。
 * 清空失效默认引用时同时移除 defaultValue，避免后续必填、模型和资源检查再次回退到旧值。
 * 父容器输入影响子节点的引用作用域，逐轮剔除直到稳定；每轮只移除引用，因此一定有限收敛。
 * 只复制发生变化的输入和节点，不修改画布、历史记录或调用方文档。
 */
export const resolveWorkflowReferenceDocument = ({
  document,
  invalidReferencePolicy
}: {
  document: WorkflowDocument;
  invalidReferencePolicy: WorkflowInvalidReferencePolicy;
}): WorkflowDocument => {
  if (invalidReferencePolicy === 'error') return document;
  // 类型外调用也不能因遗漏策略而意外进入宽松检查。
  if (invalidReferencePolicy !== 'asEmpty') {
    throw new Error('invalidReferencePolicy must be explicitly set to error or asEmpty');
  }

  let effectiveDocument = document;
  while (true) {
    const nodes = effectiveDocument.nodes.map((node) => {
      const inputs = node.inputs.map((input) => {
        const value = input.value ?? input.defaultValue;
        if (
          !isWorkflowInputReferenceForValidation({ input, flowNodeType: node.flowNodeType, value })
        )
          return input;
        if (!hasConfiguredValue(value)) return input;

        const single = isWorkflowReferenceValue(value);
        const candidates = single ? [value] : Array.isArray(value) ? value : [];
        const checkReference = createInputReferenceCheck({
          document: effectiveDocument,
          nodeId: node.nodeId,
          input
        });
        const validReferences = candidates.filter(
          (reference) =>
            isWorkflowReferenceValue(reference) && checkReference(reference).length === 0
        );
        if (validReferences.length === candidates.length && (single || Array.isArray(value)))
          return input;

        return {
          ...input,
          value: single || !Array.isArray(value) ? undefined : validReferences,
          defaultValue: undefined
        };
      });
      return inputs.every((input, index) => input === node.inputs[index])
        ? node
        : { ...node, inputs };
    });
    if (nodes.every((node, index) => node === effectiveDocument.nodes[index]))
      return effectiveDocument;
    effectiveDocument = { ...effectiveDocument, nodes };
  }
};
