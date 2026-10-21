import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum,
  LoopRunModeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowDocument } from '@fastgpt/global/core/workflow/type/document';
import {
  areWorkflowValueTypesCompatible,
  getSelectedInputRenderType,
  getWorkflowReferenceVariables,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import {
  canInputBeAgentGenerated,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput,
  isToolInputValueConfigured
} from '@fastgpt/global/core/app/formEdit/utils';
import { getInputAutomationMeta } from '@fastgpt/global/core/workflow/template/automationMeta';
import type { WorkflowDiagnostic } from '../domain/diagnostic';
import {
  getInputReferenceSourceNodes,
  getWorkflowReferenceValues,
  valueMatchesType
} from '../reference/service';
import { hasConfiguredValue } from '../template/defaultValue';
import { valueMatchesSchema } from '../template/valueSchema';
import { isWorkflowSystemModelInput } from '@fastgpt/global/common/workflow/model';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { SecretValueTypeSchema } from '@fastgpt/global/common/secret/type';

/**
 * 按 Web 的默认值、输入方式及工具生成策略校验必填项；保留 Core 的 IO 唯一性、类型和 Schema 检查。
 * 流程开始的用户问题由运行时提供，保留历史输入声明但跳过其静态输入检查。
 * JSON 编辑器复用运行时转换，动态表达式延后校验；密钥按存储结构校验，不读取或输出密文内容。
 * 只读取文档，归一化输入时不改写调用方配置；远端资源绑定继续由绑定诊断及调用方校验。
 */
export const validateNodeIO = ({
  document,
  node,
  diagnostics
}: {
  document: WorkflowDocument;
  node: StoreNodeItemType;
  diagnostics: WorkflowDiagnostic[];
}) => {
  // 注释只属于编辑器，输入没有运行时渲染方式，也不参与工作流执行校验。
  if (node.flowNodeType === FlowNodeTypeEnum.comment) return;

  /** 校验已配置引用的格式、目标、类型和作用域，默认值同样按实际引用检查。 */
  const validateReference = (input: StoreNodeItemType['inputs'][number]) => {
    const references = getWorkflowReferenceValues(input.value);
    if (!references) {
      diagnostics.push({
        code: 'WORKFLOW_REFERENCE_FORMAT_INVALID',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
      return;
    }
    for (const [sourceNodeId, outputKey] of references) {
      if (sourceNodeId === VARIABLE_NODE_ID) {
        const variable = getWorkflowReferenceVariables({ chatConfig: document.chatConfig }).find(
          (item) => item.key === outputKey
        );
        if (!variable) {
          diagnostics.push({
            code: 'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND',
            severity: 'error',
            nodeId: node.nodeId,
            inputKey: input.key,
            params: { sourceNodeId, outputKey }
          });
        } else if (
          !areWorkflowValueTypesCompatible({
            expected: input.valueType,
            actual: variable.valueType
          })
        ) {
          diagnostics.push({
            code: 'WORKFLOW_REFERENCE_TYPE_MISMATCH',
            severity: 'error',
            nodeId: node.nodeId,
            inputKey: input.key,
            params: { expected: input.valueType, actual: variable.valueType }
          });
        }
        continue;
      }

      const sourceNode = document.nodes.find((item) => item.nodeId === sourceNodeId);
      const sourceOutput = sourceNode?.outputs.find(
        (output) => output.key === outputKey || output.id === outputKey
      );
      if (!sourceNode || !sourceOutput) {
        diagnostics.push({
          code: 'WORKFLOW_REFERENCE_OUTPUT_NOT_FOUND',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: input.key,
          params: { sourceNodeId, outputKey }
        });
        continue;
      }
      if (
        !areWorkflowValueTypesCompatible({
          expected: input.valueType,
          actual: sourceOutput.valueType
        })
      ) {
        diagnostics.push({
          code: 'WORKFLOW_REFERENCE_TYPE_MISMATCH',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: input.key,
          params: { expected: input.valueType, actual: sourceOutput.valueType }
        });
      }

      const sourceIsVisible = getInputReferenceSourceNodes({
        document,
        nodeId: node.nodeId,
        input
      }).some((source) => source.nodeId === sourceNodeId);
      if (!sourceIsVisible) {
        diagnostics.push({
          code: 'WORKFLOW_REFERENCE_SOURCE_NOT_UPSTREAM',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: input.key,
          params: {
            sourceNodeId,
            outputKey,
            targetNodeId: node.nodeId,
            reason:
              sourceNodeId === node.nodeId
                ? 'Self-reference is not allowed'
                : 'Source output is outside the reference scope of the target input.',
            remediation:
              "For nodes in the same scope, connect the upstream source using 'edge.connect' before referencing it. Otherwise use a visible parent-container source; container outputs may reference their own children. Do not add cross-scope execution edges."
          }
        });
      }
    }
  };

  const isToolNode = document.executionEdges.some(
    (edge) => edge.target.kind === 'selectedTools' && edge.target.nodeId === node.nodeId
  );
  const skipNodeRequiredCheck = [
    FlowNodeTypeEnum.workflowStart,
    FlowNodeTypeEnum.pluginInput
  ].includes(node.flowNodeType);

  /** 单引用的空占位符也算未填写；数组引用只在整个列表为空时触发必填错误。 */
  const isReferenceValueMissing = (value: unknown, isArrayType: boolean) => {
    if (!Array.isArray(value) || value.length === 0) return true;
    if (isArrayType) return false;
    if (value.length === 2 && !Array.isArray(value[0])) {
      return typeof value[0] !== 'string' || !value[0] || !value[1];
    }
    return false;
  };

  const inputKeys = new Set<string>();
  for (const input of node.inputs) {
    if (inputKeys.has(input.key)) {
      diagnostics.push({
        code: 'WORKFLOW_INPUT_KEY_DUPLICATED',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
    }
    inputKeys.add(input.key);

    // 流程开始不提供用户问题的配置界面，输入来自运行时 query 或调用参数。
    // 旧节点可能保留占位、失效引用或调试值；兼容这些存量值，不按普通输入预检。
    if (
      node.flowNodeType === FlowNodeTypeEnum.workflowStart &&
      input.key === NodeInputKeyEnum.userChatInput
    ) {
      continue;
    }

    const normalizedInput =
      isToolNode || input.key === NodeInputKeyEnum.userChatInput
        ? initToolInputTypeByDefaultMode(input, {
            allowUserChatInputAgentGenerated: isToolNode
          })
        : input;
    const selectedType = getSelectedInputRenderType(normalizedInput);
    if (selectedType === undefined) {
      diagnostics.push({
        code: 'WORKFLOW_INPUT_MODE_INVALID',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
      continue;
    }

    // Agent 生成模式不会使用旧的手动值，不能要求预填或把残留引用当成实际输入。
    if (
      isToolNode &&
      isAgentGeneratedToolInput(normalizedInput) &&
      canInputBeAgentGenerated(normalizedInput)
    ) {
      continue;
    }

    if (
      isToolNode &&
      input.key === NodeInputKeyEnum.systemInputConfig &&
      !isToolInputValueConfigured({ input })
    ) {
      diagnostics.push({
        code: 'WORKFLOW_TOOL_INPUT_CONFIGURATION_MISSING',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
      continue;
    }

    const isUnusedConditionalLoopArray =
      node.flowNodeType === FlowNodeTypeEnum.loopRun &&
      input.key === NodeInputKeyEnum.loopRunInputArray &&
      node.inputs.find((item) => item.key === NodeInputKeyEnum.loopRunMode)?.value ===
        LoopRunModeEnum.conditional;
    // 条件循环不消费数组输入，和 Web 一样忽略其残留值。
    if (isUnusedConditionalLoopArray) continue;
    // 动态选项按选择器的“至少一个有效引用”规则统一检查，避免通用引用与节点检查重复报错。
    if (
      node.flowNodeType === FlowNodeTypeEnum.userSelect &&
      input.key === NodeInputKeyEnum.userSelectOptions &&
      nodeInputIsReference(normalizedInput)
    )
      continue;
    const defaultPolicy = getInputAutomationMeta(node.flowNodeType, input.key)?.defaultPolicy;
    const isExternalBinding =
      defaultPolicy === 'userRequired' || defaultPolicy === 'remoteValidated';
    const storedValue = input.value ?? input.defaultValue;
    const isDynamicJson =
      selectedType === FlowNodeInputTypeEnum.JSONEditor &&
      typeof storedValue === 'string' &&
      storedValue.includes('{{');
    // JSON 编辑器持久化文本，和执行时一样按目标类型转换；不改写画布或文档中的原值。
    const effectiveValue =
      selectedType === FlowNodeInputTypeEnum.JSONEditor && !isDynamicJson
        ? valueTypeFormat(storedValue, input.valueType)
        : storedValue;
    // 历史明文字符串继续兼容；当前密码组件使用 { value, secret } 存储结构。
    const secretValueResult =
      selectedType === FlowNodeInputTypeEnum.password &&
      effectiveValue !== undefined &&
      effectiveValue !== null &&
      typeof effectiveValue !== 'string'
        ? SecretValueTypeSchema.safeParse(effectiveValue)
        : undefined;
    const isReference = nodeInputIsReference(normalizedInput);
    const isMissingValue = (() => {
      if (secretValueResult?.success) {
        return (
          !hasConfiguredValue(secretValueResult.data.value) &&
          !hasConfiguredValue(secretValueResult.data.secret)
        );
      }
      return isReference
        ? isReferenceValueMissing(effectiveValue, !!input.valueType?.startsWith('array'))
        : !hasConfiguredValue(effectiveValue);
    })();
    const skipGenericRequiredCheck =
      skipNodeRequiredCheck ||
      (node.flowNodeType === FlowNodeTypeEnum.userSelect &&
        input.key === NodeInputKeyEnum.userSelectOptions) ||
      selectedType === FlowNodeInputTypeEnum.hidden ||
      selectedType === FlowNodeInputTypeEnum.off ||
      !input.valueType ||
      input.valueType === WorkflowIOValueTypeEnum.boolean ||
      // 静态模型必填由可选模型检查统一负责；CLI 生成不检查模型，动态引用仍执行结构校验。
      (!isReference &&
        (selectedType === FlowNodeInputTypeEnum.selectLLMModel ||
          isWorkflowSystemModelInput({ node, input }))) ||
      (node.flowNodeType === FlowNodeTypeEnum.code && input.canEdit);

    // 代码动态变量遵循 Web 的完整性检查，和通用必填规则分开，避免同一缺项重复报错。
    if (
      !skipNodeRequiredCheck &&
      node.flowNodeType === FlowNodeTypeEnum.code &&
      input.canEdit &&
      ![NodeInputKeyEnum.code, NodeInputKeyEnum.codeType, NodeInputKeyEnum.addInputParam].includes(
        input.key as NodeInputKeyEnum
      ) &&
      (!input.key || !input.label || isReferenceValueMissing(input.value, false))
    ) {
      diagnostics.push({
        code: 'WORKFLOW_CODE_INPUT_INCOMPLETE',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
      continue;
    }

    if (
      !skipGenericRequiredCheck &&
      input.required === true &&
      !isExternalBinding &&
      isMissingValue
    ) {
      diagnostics.push({
        code: 'WORKFLOW_REQUIRED_INPUT_MISSING',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key
      });
      continue;
    }
    if (secretValueResult) {
      if (!secretValueResult.success) {
        diagnostics.push({
          code: 'WORKFLOW_INPUT_VALUE_SCHEMA_INVALID',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: input.key
        });
      }
      // 密文无法按明文字符串的类型和 Schema 检查；诊断也不能携带敏感原值。
      continue;
    }
    if (!hasConfiguredValue(effectiveValue)) continue;
    // 编辑器变量替换后才能确定 JSON 的最终结构，静态阶段不能按未展开文本拒绝。
    if (isDynamicJson) continue;

    if (isReference) {
      validateReference({ ...normalizedInput, value: effectiveValue });
    } else if (!valueMatchesType(effectiveValue, input.valueType)) {
      diagnostics.push({
        code: 'WORKFLOW_INPUT_VALUE_TYPE_INVALID',
        severity: 'error',
        nodeId: node.nodeId,
        inputKey: input.key,
        params: { expected: input.valueType }
      });
    } else {
      const valueSchema =
        getInputAutomationMeta(node.flowNodeType, input.key)?.valueSchema ?? input.customJsonSchema;
      if (valueSchema && !valueMatchesSchema(effectiveValue, valueSchema)) {
        diagnostics.push({
          code: 'WORKFLOW_INPUT_VALUE_SCHEMA_INVALID',
          severity: 'error',
          nodeId: node.nodeId,
          inputKey: input.key
        });
      }
    }
  }

  const outputKeys = new Set<string>();
  for (const output of node.outputs) {
    if (outputKeys.has(output.key)) {
      diagnostics.push({
        code: 'WORKFLOW_OUTPUT_KEY_DUPLICATED',
        severity: 'error',
        nodeId: node.nodeId,
        params: { outputKey: output.key }
      });
    }
    outputKeys.add(output.key);
  }
};
