import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { isValidArrayReferenceValue } from '@fastgpt/global/core/workflow/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
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

// ─── resolveParallelConcurrency ───────────────────────────────────────────────

/**
 * Read user-configured concurrency from inputs array, clamp to env max.
 * - user value: floor to integer; <1 → 1; >max → max.
 * - envMax: clamped to [5, 100] (TC0045).
 * - Default concurrency = 5, env max default = 10.
 */
export const resolveParallelConcurrency = (
  inputs: FlowNodeInputItemType[],
  envMax: number | undefined
): number => {
  const rawMax = envMax && envMax > 0 ? envMax : 10;
  const max = Math.max(5, Math.min(Math.floor(rawMax), 100));
  const defaultConcurrency = 5;

  const input = inputs.find((i) => i.key === NodeInputKeyEnum.parallelRunMaxConcurrency);
  const rawValue = input?.value;

  if (rawValue === undefined || rawValue === null) {
    return Math.min(defaultConcurrency, max);
  }

  const value = Number(rawValue);
  if (isNaN(value)) return Math.min(defaultConcurrency, max);
  const floored = Math.floor(value);
  if (floored < 1) return 1;
  return Math.min(floored, max);
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

// ─── validateConcurrencyInput ─────────────────────────────────────────────────

type ValidateConcurrencyResult =
  | { valid: true }
  | { valid: false; error?: string; clamped?: number };

/**
 * Validate user input for concurrency field.
 * Returns { valid: true } or { valid: false, clamped?, error? }.
 * Non-integer values are floored.
 */
export const validateConcurrencyInput = (
  value: unknown,
  envMax: number
): ValidateConcurrencyResult => {
  const num = Number(value);
  if (isNaN(num) || typeof value === 'string') {
    return { valid: false, error: 'not a number' };
  }
  if (num < 1) {
    return { valid: false, clamped: 1, error: 'must be >= 1' };
  }
  const floored = Math.floor(num);
  if (floored !== num) {
    return { valid: false, clamped: floored, error: 'must be integer' };
  }
  if (floored > envMax) {
    return { valid: false, clamped: envMax, error: `exceeds max ${envMax}` };
  }
  return { valid: true };
};
