import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  StoreNodeItemTypeSchema,
  type StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import { areWorkflowValueTypesCompatible } from '@fastgpt/global/core/workflow/utils';
import type { WorkflowDocument } from '../domain/document';
import { WorkflowCommandError, type WorkflowDiagnostic } from '../domain/diagnostic';
import { hasConfiguredValue, resolveInitialInputValue } from './defaultValue';
import type { NodeTemplateRef, WorkflowTemplateProvider } from './type';

/** 从原始 FastGPT 模板创建完整 StoreNode，Descriptor 元数据不会进入运行时对象。 */
export const instantiateNodeFromTemplate = async ({
  document,
  templateRef,
  nodeId,
  name,
  position,
  parentNodeId,
  provider,
  locale,
  translate = (value) => value
}: {
  document: WorkflowDocument;
  templateRef: NodeTemplateRef;
  nodeId: string;
  name?: string;
  position?: { x: number; y: number };
  parentNodeId?: string;
  provider: WorkflowTemplateProvider;
  locale: string;
  translate?: (value: string) => string;
}): Promise<{ node: StoreNodeItemType; warnings: WorkflowDiagnostic[] }> => {
  if (document.nodes.some((node) => node.nodeId === nodeId)) {
    throw new WorkflowCommandError([
      { code: 'WORKFLOW_NODE_ID_DUPLICATED', severity: 'error', nodeId }
    ]);
  }

  const { template, automationMeta, validatedInputDefaults } = await provider.resolve(templateRef, {
    locale
  });
  if (
    template.unique === true &&
    document.nodes.some(
      (node) => node.flowNodeType === template.flowNodeType && node.parentNodeId === parentNodeId
    )
  ) {
    throw new WorkflowCommandError([
      {
        code: 'WORKFLOW_UNIQUE_NODE_EXISTS',
        severity: 'error',
        params: { flowNodeType: template.flowNodeType }
      }
    ]);
  }

  const node = StoreNodeItemTypeSchema.parse({
    ...structuredClone(template),
    name: name ?? translate(template.name),
    intro: template.intro ? translate(template.intro) : undefined,
    nodeId,
    parentNodeId,
    position,
    inputs: template.inputs.map((input) => {
      const meta = automationMeta?.inputs?.[input.key];
      const usesSafeDefault =
        meta?.resourceKind !== undefined ||
        meta?.defaultPolicy === 'userRequired' ||
        meta?.defaultPolicy === 'remoteValidated';
      return {
        ...structuredClone(input),
        value: resolveInitialInputValue({
          input,
          meta,
          validatedRemoteDefault: validatedInputDefaults?.[input.key]
        }),
        ...(usesSafeDefault ? { defaultValue: undefined } : {}),
        label: translate(input.label),
        description: input.description ? translate(input.description) : undefined,
        placeholder: input.placeholder ? translate(input.placeholder) : undefined,
        debugLabel: input.debugLabel ? translate(input.debugLabel) : undefined,
        toolDescription: input.toolDescription ? translate(input.toolDescription) : undefined,
        list: input.list?.map((item) => ({
          ...item,
          label: item.label ? translate(item.label) : item.label,
          description: item.description ? translate(item.description) : undefined
        }))
      };
    }),
    outputs: template.outputs.map((output) => ({
      ...structuredClone(output),
      label: output.label ? translate(output.label) : output.label,
      description: output.description ? translate(output.description) : undefined
    }))
  });

  const startNode = document.nodes.find(
    (item) => item.flowNodeType === FlowNodeTypeEnum.workflowStart
  );
  if (startNode) {
    const userInputOutput = startNode.outputs.find(
      (output) => output.key === NodeOutputKeyEnum.userChatInput
    );
    const userFilesOutput = startNode.outputs.find(
      (output) => output.key === NodeOutputKeyEnum.userFiles
    );
    for (const input of node.inputs) {
      const referenceIndex = input.renderTypeList.indexOf(FlowNodeInputTypeEnum.reference);
      if (referenceIndex < 0 || hasConfiguredValue(input.value)) continue;

      const referenceDefault = (() => {
        if (input.key === NodeInputKeyEnum.userChatInput && userInputOutput) {
          return {
            value: [startNode.nodeId, userInputOutput.key],
            outputs: [userInputOutput]
          };
        }
        if (input.key === NodeInputKeyEnum.fileUrlList && userFilesOutput) {
          return {
            value: [[startNode.nodeId, userFilesOutput.key]],
            outputs: [userFilesOutput]
          };
        }
        if (input.key === NodeInputKeyEnum.datasetSearchInput && userInputOutput) {
          return {
            value: [
              [startNode.nodeId, userInputOutput.key],
              ...(userFilesOutput ? [[startNode.nodeId, userFilesOutput.key]] : [])
            ],
            outputs: [userInputOutput, ...(userFilesOutput ? [userFilesOutput] : [])]
          };
        }
      })();
      if (
        !referenceDefault ||
        !referenceDefault.outputs.every((output) =>
          areWorkflowValueTypesCompatible({
            expected: input.valueType,
            actual: output.valueType
          })
        )
      ) {
        continue;
      }
      input.value = referenceDefault.value;
      input.selectedType = FlowNodeInputTypeEnum.reference;
      input.selectedTypeIndex = referenceIndex;
    }
  }

  return { node, warnings: [] };
};
