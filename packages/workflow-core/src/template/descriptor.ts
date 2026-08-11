import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { getWorkflowReferenceSourceValueTypes } from '@fastgpt/global/core/workflow/utils';
import type {
  NodeTemplateAutomationMeta,
  NodeInputAutomationMeta,
  NodeTemplateRef,
  WorkflowInputDefaultPolicy,
  WorkflowResourceKind
} from './type';
import { getNodeRuntimeContract, type NodeRuntimeContract } from './contract';

export type NodeParameterInputMode = 'literal' | 'reference' | 'secret';

export type NodeParameterDescriptor = {
  key: string;
  label: string;
  description: string;
  valueType?: string;
  required: boolean;
  defaultValue?: unknown;
  defaultPolicy: WorkflowInputDefaultPolicy;
  resourceKind?: WorkflowResourceKind;
  bindingRequired: boolean;
  configurable: boolean;
  inputModes: NodeParameterInputMode[];
  referencePolicy?: {
    acceptedSourceValueTypes: WorkflowIOValueTypeEnum[];
  };
  enum?: Array<{ label?: string; value: string; description?: string }>;
  constraints?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    valueSchema?: Record<string, unknown>;
  };
  examples?: unknown[];
};

export type NodeTemplateDescriptor = {
  schemaVersion: 'fastgpt-workflow-node-contract/v1';
  template: NodeTemplateRef;
  name: string;
  intro?: string;
  flowNodeType: string;
  inputs: NodeParameterDescriptor[];
  outputs: Array<{
    id: string;
    key: string;
    label: string;
    description?: string;
    valueType?: string;
    required: boolean;
    executable: boolean;
  }>;
  constraints: {
    unique: boolean;
    isTool: boolean;
  };
  execution: NodeRuntimeContract['execution'];
  dynamicIO: NodeRuntimeContract['dynamicIO'];
  container: NodeRuntimeContract['container'];
  effects: NodeRuntimeContract['effects'];
};

const getInferredInputModes = (renderTypes: FlowNodeInputTypeEnum[]): NodeParameterInputMode[] => {
  const literalRenderTypes = renderTypes.filter(
    (type) =>
      type !== FlowNodeInputTypeEnum.reference &&
      type !== FlowNodeInputTypeEnum.addInputParam &&
      type !== FlowNodeInputTypeEnum.agentGenerated
  );
  const modes = [
    literalRenderTypes.length > 0 ? 'literal' : undefined,
    renderTypes.includes(FlowNodeInputTypeEnum.reference) ? 'reference' : undefined,
    renderTypes.includes(FlowNodeInputTypeEnum.password) ? 'secret' : undefined
  ].filter((item): item is NodeParameterInputMode => item !== undefined);
  return [...new Set(modes)];
};

/**
 * 计算 Builder 对单个节点输入的可操作能力。
 * hidden 输入在 FastGPT 中也用于高级/弹窗设置，因此仍按字面量输入处理；
 * system_input_config、addInputParam 和 agentGenerated-only 不属于 Builder 配置面。
 */
export const getNodeInputCapability = ({
  input,
  automationMeta
}: {
  input: FlowNodeInputItemType;
  automationMeta?: NodeInputAutomationMeta;
}): { configurable: boolean; inputModes: NodeParameterInputMode[] } => {
  const inferredInputModes = getInferredInputModes(input.renderTypeList);
  const isAgentGeneratedOnly =
    input.renderTypeList.length > 0 &&
    input.renderTypeList.every((type) => type === FlowNodeInputTypeEnum.agentGenerated);
  if (
    input.canEdit === false ||
    automationMeta?.configurable === false ||
    input.key === NodeInputKeyEnum.systemInputConfig ||
    input.renderTypeList.includes(FlowNodeInputTypeEnum.addInputParam) ||
    isAgentGeneratedOnly
  ) {
    return { configurable: false, inputModes: [] };
  }

  const requestedInputModes = automationMeta?.inputModes ?? inferredInputModes;
  const inputModes = requestedInputModes.filter((mode) => {
    if (mode === 'literal') {
      return (
        inferredInputModes.includes('literal') ||
        (automationMeta?.configurable === true &&
          automationMeta.inputModes?.includes('literal') === true)
      );
    }
    if (mode === 'reference') return inferredInputModes.includes('reference');
    return inferredInputModes.includes('secret');
  });
  const configurable = (automationMeta?.configurable ?? true) && inputModes.length > 0;

  return { configurable, inputModes: configurable ? inputModes : [] };
};

/** 将现有模板实时归一化为 CLI/Agent 可读取的参数契约。 */
export const normalizeNodeTemplateDescriptor = ({
  template,
  templateRef,
  automationMeta,
  translate = (value) => value
}: {
  template: FlowNodeTemplateType;
  templateRef: NodeTemplateRef;
  automationMeta?: NodeTemplateAutomationMeta;
  translate?: (value: string) => string;
}): NodeTemplateDescriptor => {
  const runtimeContract = getNodeRuntimeContract(template);
  return {
    schemaVersion: 'fastgpt-workflow-node-contract/v1',
    template: templateRef,
    name: translate(template.name),
    intro: template.intro ? translate(template.intro) : undefined,
    flowNodeType: template.flowNodeType,
    inputs: template.inputs
      .filter((input) => input.deprecated !== true)
      .map((input) => {
        const meta = automationMeta?.inputs?.[input.key];
        const { configurable, inputModes } = getNodeInputCapability({
          input,
          automationMeta: meta
        });
        const constraints = {
          min: input.min,
          max: input.max,
          minLength: input.minLength,
          maxLength: input.maxLength,
          valueSchema: meta?.valueSchema ?? input.customJsonSchema
        };
        return {
          key: input.key,
          label: translate(input.label),
          description: translate(
            [
              meta?.agentHint,
              input.toolDescription,
              input.description,
              input.label,
              input.key
            ].find((value) => typeof value === 'string' && value.trim().length > 0) as string
          ),
          valueType: input.valueType,
          required: input.required ?? false,
          defaultValue: input.defaultValue ?? input.value,
          defaultPolicy: meta?.defaultPolicy ?? 'template',
          resourceKind: meta?.resourceKind,
          bindingRequired: meta?.bindingRequired ?? false,
          configurable,
          inputModes,
          referencePolicy: inputModes.includes('reference')
            ? {
                acceptedSourceValueTypes: getWorkflowReferenceSourceValueTypes(input.valueType)
              }
            : undefined,
          enum: input.list?.map((item) => ({
            ...item,
            label: item.label ? translate(item.label) : undefined,
            description: item.description ? translate(item.description) : undefined
          })),
          constraints,
          examples: meta?.examples
        };
      }),
    outputs: template.outputs
      .filter((output) => output.deprecated !== true)
      .map((output) => ({
        id: output.id,
        key: output.key,
        label: translate(output.label ?? output.key),
        description: output.description ? translate(output.description) : undefined,
        valueType: output.valueType,
        required: output.required ?? false,
        executable: output.type === FlowNodeOutputTypeEnum.source
      })),
    constraints: {
      unique: template.unique === true,
      isTool: template.isTool === true
    },
    ...runtimeContract
  };
};
