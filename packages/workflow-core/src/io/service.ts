import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  FlowNodeInputItemTypeSchema,
  type FlowNodeInputItemType,
  FlowNodeOutputItemTypeSchema,
  type FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { WorkflowDocument } from '../domain/document';
import { WorkflowCommandError } from '../domain/diagnostic';
import { getDocumentNode } from '../nesting/service';
import { extractCodeInputDefinitions, extractCodeOutputDefinitions } from '../code/io';

const dynamicOutputNodeTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.code,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.httpRequest468,
  FlowNodeTypeEnum.loopRun
]);

const supportsDynamicOutputs = (node: ReturnType<typeof getDocumentNode>) =>
  dynamicOutputNodeTypes.has(node.flowNodeType) ||
  node.outputs.some((item) => item.key === NodeOutputKeyEnum.addOutputParam);

const dynamicInputMarkerKeys = new Set<string>([
  NodeInputKeyEnum.addInputParam,
  NodeInputKeyEnum.datasetQuoteList
]);

const supportsDynamicInputs = (node: ReturnType<typeof getDocumentNode>) =>
  node.inputs.some((item) => dynamicInputMarkerKeys.has(item.key));

/** 向带动态输入标记的节点添加一个可编辑输入。 */
export const addNodeInput = ({
  document,
  nodeId,
  input
}: {
  document: WorkflowDocument;
  nodeId: string;
  input: FlowNodeInputItemType;
}) => {
  const node = getDocumentNode(document, nodeId);
  if (!supportsDynamicInputs(node)) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_DYNAMIC_INPUT_UNSUPPORTED', severity: 'error', nodeId }
    ]);
  }
  if (node.inputs.some((item) => item.key === input.key)) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_INPUT_KEY_DUPLICATED',
        severity: 'error',
        nodeId,
        inputKey: input.key
      }
    ]);
  }
  const parsedInput = FlowNodeInputItemTypeSchema.parse({
    ...input,
    label: input.label || input.key,
    valueType: input.valueType ?? WorkflowIOValueTypeEnum.any,
    renderTypeList:
      input.renderTypeList.length > 0 ? input.renderTypeList : [FlowNodeInputTypeEnum.input],
    canEdit: true
  });
  node.inputs.push(parsedInput);
};

/** 删除动态输入；输入携带的引用会随输入本身一并删除。 */
export const removeNodeInput = ({
  document,
  nodeId,
  inputKey
}: {
  document: WorkflowDocument;
  nodeId: string;
  inputKey: string;
}) => {
  const node = getDocumentNode(document, nodeId);
  const inputIndex = node.inputs.findIndex((item) => item.key === inputKey);
  if (inputIndex < 0) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_INPUT_NOT_FOUND', severity: 'error', nodeId, inputKey }
    ]);
  }
  if (
    !supportsDynamicInputs(node) ||
    dynamicInputMarkerKeys.has(inputKey) ||
    node.inputs[inputIndex].canEdit !== true
  ) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_INPUT_REMOVE_FORBIDDEN', severity: 'error', nodeId, inputKey }
    ]);
  }
  node.inputs.splice(inputIndex, 1);
};

/** 向支持动态输出的节点添加一个数据输出。 */
export const addNodeOutput = ({
  document,
  nodeId,
  output
}: {
  document: WorkflowDocument;
  nodeId: string;
  output: FlowNodeOutputItemType;
}) => {
  const node = getDocumentNode(document, nodeId);
  if (!supportsDynamicOutputs(node)) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_DYNAMIC_OUTPUT_UNSUPPORTED', severity: 'error', nodeId }
    ]);
  }
  if (node.outputs.some((item) => item.key === output.key)) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_OUTPUT_KEY_DUPLICATED',
        severity: 'error',
        nodeId,
        params: { outputKey: output.key }
      }
    ]);
  }
  const parsedOutput = FlowNodeOutputItemTypeSchema.parse({
    ...output,
    id: output.id || output.key,
    label: output.label || output.key,
    type: output.type ?? FlowNodeOutputTypeEnum.dynamic,
    valueType: output.valueType ?? WorkflowIOValueTypeEnum.any
  });
  const markerIndex = node.outputs.findIndex(
    (item) => item.key === NodeOutputKeyEnum.addOutputParam
  );
  if (markerIndex >= 0) node.outputs.splice(markerIndex, 0, parsedOutput);
  else node.outputs.push(parsedOutput);
};

const isReferenceToOutput = (value: unknown, nodeId: string, outputKey: string): boolean => {
  if (!Array.isArray(value)) return false;
  if (value.length === 2 && value[0] === nodeId && value[1] === outputKey) return true;
  return value.some((item) => isReferenceToOutput(item, nodeId, outputKey));
};

/** 删除动态输出并清理其 source execution edge；数据引用保留并在结果中报告。 */
export const removeNodeOutput = ({
  document,
  nodeId,
  outputKey
}: {
  document: WorkflowDocument;
  nodeId: string;
  outputKey: string;
}) => {
  const node = getDocumentNode(document, nodeId);
  const outputIndex = node.outputs.findIndex((item) => item.key === outputKey);
  if (outputIndex < 0) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_OUTPUT_NOT_FOUND', severity: 'error', nodeId, params: { outputKey } }
    ]);
  }
  const output = node.outputs[outputIndex];
  if (
    output.type !== FlowNodeOutputTypeEnum.dynamic &&
    output.type !== FlowNodeOutputTypeEnum.source
  ) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_OUTPUT_REMOVE_FORBIDDEN', severity: 'error', nodeId, params: { outputKey } }
    ]);
  }
  node.outputs.splice(outputIndex, 1);
  const before = document.executionEdges.length;
  document.executionEdges = document.executionEdges.filter(
    (edge) =>
      !(
        edge.source.kind === 'sourceOutput' &&
        edge.source.nodeId === nodeId &&
        edge.source.outputKey === outputKey
      )
  );
  const references = document.nodes.flatMap((item) =>
    item.inputs
      .filter((input) => isReferenceToOutput(input.value, nodeId, outputKey))
      .map((input) => ({ nodeId: item.nodeId, inputKey: input.key }))
  );
  return { removedEdgeCount: before - document.executionEdges.length, references };
};

const codeSystemOutputKeys = new Set<string>([
  NodeOutputKeyEnum.addOutputParam,
  NodeOutputKeyEnum.rawResponse,
  NodeOutputKeyEnum.error
]);

/**
 * 以 main 参数和 return 对象为代码节点动态 IO 的事实源。
 * 无法静态识别参数或返回对象时保留原配置，避免编辑中的不完整代码造成破坏性删除。
 */
export const syncCodeNodeIO = ({
  document,
  nodeId,
  code
}: {
  document: WorkflowDocument;
  nodeId: string;
  code: string;
}) => {
  const node = getDocumentNode(document, nodeId);
  if (node.flowNodeType !== FlowNodeTypeEnum.code) {
    return {
      addedInputKeys: [],
      removedInputKeys: [],
      addedOutputKeys: [],
      removedOutputs: []
    };
  }

  const inputDefinitions = extractCodeInputDefinitions(code);
  const addedInputKeys: string[] = [];
  const removedInputKeys: string[] = [];
  if (inputDefinitions) {
    const nextInputKeys = new Set(inputDefinitions.map((item) => item.key));
    node.inputs
      .filter(
        (input) =>
          input.canEdit === true &&
          !dynamicInputMarkerKeys.has(input.key) &&
          !nextInputKeys.has(input.key)
      )
      .forEach((input) => {
        removeNodeInput({ document, nodeId, inputKey: input.key });
        removedInputKeys.push(input.key);
      });

    inputDefinitions.forEach((definition) => {
      const existingInput = node.inputs.find((input) => input.key === definition.key);
      if (existingInput) {
        if (definition.valueType) existingInput.valueType = definition.valueType;
        return;
      }
      addNodeInput({
        document,
        nodeId,
        input: FlowNodeInputItemTypeSchema.parse({
          key: definition.key,
          label: definition.key,
          valueType: definition.valueType ?? WorkflowIOValueTypeEnum.any,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          canEdit: true,
          required: true,
          customInputConfig: {
            selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
            showDescription: false,
            showDefaultValue: true
          }
        })
      });
      addedInputKeys.push(definition.key);
    });
  }

  const outputDefinitions = extractCodeOutputDefinitions(code);
  const addedOutputKeys: string[] = [];
  const removedOutputs: Array<{
    outputKey: string;
    removedEdgeCount: number;
    references: Array<{ nodeId: string; inputKey: string }>;
  }> = [];
  if (outputDefinitions) {
    const nextOutputKeys = new Set(outputDefinitions.map((item) => item.key));
    node.outputs
      .filter(
        (output) =>
          output.type === FlowNodeOutputTypeEnum.dynamic &&
          !codeSystemOutputKeys.has(output.key) &&
          !nextOutputKeys.has(output.key)
      )
      .forEach((output) => {
        removedOutputs.push({
          outputKey: output.key,
          ...removeNodeOutput({ document, nodeId, outputKey: output.key })
        });
      });

    outputDefinitions.forEach((definition) => {
      const existingOutput = node.outputs.find((output) => output.key === definition.key);
      if (existingOutput) {
        if (definition.valueType) existingOutput.valueType = definition.valueType;
        return;
      }
      addNodeOutput({
        document,
        nodeId,
        output: FlowNodeOutputItemTypeSchema.parse({
          id: definition.key,
          key: definition.key,
          label: definition.key,
          type: FlowNodeOutputTypeEnum.dynamic,
          valueType: definition.valueType ?? WorkflowIOValueTypeEnum.any
        })
      });
      addedOutputKeys.push(definition.key);
    });
  }

  return { addedInputKeys, removedInputKeys, addedOutputKeys, removedOutputs };
};

/** 表单字段是输出的事实源；字段整体更新后同步对应静态输出。 */
export const syncFormInputOutputs = ({
  document,
  nodeId,
  previousFieldKeys
}: {
  document: WorkflowDocument;
  nodeId: string;
  previousFieldKeys: string[];
}) => {
  const node = getDocumentNode(document, nodeId);
  if (node.flowNodeType !== FlowNodeTypeEnum.formInput) return;
  const forms = node.inputs.find((item) => item.key === NodeInputKeyEnum.userInputForms)?.value;
  if (!Array.isArray(forms)) return;
  const oldKeys = new Set(previousFieldKeys);
  node.outputs = node.outputs.filter((output) => !oldKeys.has(output.key));
  for (const form of forms) {
    if (!form || typeof form !== 'object') continue;
    const field = form as { key?: unknown; label?: unknown; valueType?: unknown };
    if (typeof field.key !== 'string' || !field.key) continue;
    node.outputs.push(
      FlowNodeOutputItemTypeSchema.parse({
        id: field.key,
        key: field.key,
        label: typeof field.label === 'string' ? field.label : field.key,
        type: FlowNodeOutputTypeEnum.static,
        valueType:
          typeof field.valueType === 'string' ? field.valueType : WorkflowIOValueTypeEnum.any
      })
    );
  }
};
