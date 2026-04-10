import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { isValidArrayReferenceValue } from '@fastgpt/global/core/workflow/utils';
import type { ReferenceArrayValueType } from '@fastgpt/global/core/workflow/type/io';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

// Maps array type → element type (reverse of ArrayTypeMap)
const arrayTypeToElementMap: Partial<Record<WorkflowIOValueTypeEnum, WorkflowIOValueTypeEnum>> = {
  [WorkflowIOValueTypeEnum.arrayString]: WorkflowIOValueTypeEnum.string,
  [WorkflowIOValueTypeEnum.arrayNumber]: WorkflowIOValueTypeEnum.number,
  [WorkflowIOValueTypeEnum.arrayBoolean]: WorkflowIOValueTypeEnum.boolean,
  [WorkflowIOValueTypeEnum.arrayObject]: WorkflowIOValueTypeEnum.object,
  [WorkflowIOValueTypeEnum.arrayAny]: WorkflowIOValueTypeEnum.any
};

// ─── resolveArrayItemValueType ────────────────────────────────────────────────

type ResolveArrayItemValueTypeParams = {
  arrayReferenceValue: ReferenceArrayValueType | undefined;
  nodeIds: string[];
  globalVariables: Array<{ key: string; valueType: WorkflowIOValueTypeEnum }>;
  getNodeById: (id: string) => RuntimeNodeItemType | undefined;
};

/**
 * Derive the element valueType from the referenced array output.
 * Mirrors the same logic in NodeLoop.tsx to keep behaviour consistent.
 */
export const resolveArrayItemValueType = ({
  arrayReferenceValue,
  nodeIds,
  globalVariables,
  getNodeById
}: ResolveArrayItemValueTypeParams): WorkflowIOValueTypeEnum => {
  if (
    !arrayReferenceValue ||
    arrayReferenceValue.length === 0 ||
    !isValidArrayReferenceValue(arrayReferenceValue, nodeIds)
  ) {
    return WorkflowIOValueTypeEnum.any;
  }

  const firstRef = arrayReferenceValue[0];

  const valueType = (() => {
    if (firstRef?.[0] === VARIABLE_NODE_ID) {
      return globalVariables.find((item) => item.key === firstRef[1])?.valueType;
    } else {
      const node = getNodeById(firstRef?.[0]);
      const output = node?.outputs.find((output) => output.id === firstRef?.[1]);
      return output?.valueType;
    }
  })();

  return arrayTypeToElementMap[valueType as WorkflowIOValueTypeEnum] ?? WorkflowIOValueTypeEnum.any;
};
