import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { getWorkflowReferenceSourceValueTypes } from '@fastgpt/global/core/workflow/utils';
import type {
  NodeTemplateAutomationMeta,
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

const getInputModes = (renderTypes: FlowNodeInputTypeEnum[]): NodeParameterInputMode[] => {
  const literalRenderTypes = renderTypes.filter(
    (type) =>
      type !== FlowNodeInputTypeEnum.reference &&
      type !== FlowNodeInputTypeEnum.hidden &&
      type !== FlowNodeInputTypeEnum.addInputParam
  );
  const modes = [
    literalRenderTypes.length > 0 ? 'literal' : undefined,
    renderTypes.includes(FlowNodeInputTypeEnum.reference) ? 'reference' : undefined,
    renderTypes.includes(FlowNodeInputTypeEnum.password) ? 'secret' : undefined
  ].filter((item): item is NodeParameterInputMode => item !== undefined);
  return [...new Set(modes)];
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
        const inputModes = meta?.inputModes ?? getInputModes(input.renderTypeList);
        const constraints = {
          min: input.min,
          max: input.max,
          minLength: input.minLength,
          maxLength: input.maxLength,
          valueSchema: meta?.valueSchema
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
          configurable:
            meta?.configurable ??
            (input.canEdit !== false &&
              !input.renderTypeList.includes(FlowNodeInputTypeEnum.hidden) &&
              !input.renderTypeList.includes(FlowNodeInputTypeEnum.addInputParam)),
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
