import { NodeInputKeyEnum } from '../../../../core/workflow/constants';
import {
  getWorkflowReferenceItemsFromValue,
  mapWorkflowInputReferenceValues,
  workflowInputUsesSecretValues
} from '../../reference';
import type { FlowNodeTypeEnum } from '../../../../core/workflow/node/constant';
import { isNestedParentNodeType } from '../../../../core/workflow/node/constant';
import { isReferenceOptionFormItem } from '../../../../core/workflow/template/system/interactive/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType,
  ReferenceItemValueType
} from '../../../../core/workflow/type/io';
import type {
  WorkflowCommandError,
  WorkflowFieldIdentity
} from '../../../../core/workflow/editor/types';

/**
 * Runtime 内部共享的最小原语：值拷贝/比较/冻结、命令错误工厂、字段身份。
 * 这些函数没有单一领域归属，被多个 module 复用，集中放置避免 module 之间互相 import 实现细节。
 */

// region valueSemantics Runtime value cloning and freezing

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Copy fixture and internal snapshot values while preserving runtime functions. */
export const cloneValue = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
  if (!isObject(value) || typeof value === 'function') return value;
  const previous = seen.get(value);
  if (previous) return previous as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;

  const target = Array.isArray(value) ? [] : {};
  seen.set(value, target);
  Object.keys(value).forEach((key) => {
    const copied = cloneValue(value[key], seen);
    if (key === '__proto__') {
      // JSON 自有键必须保留，普通赋值会调用对象原型上的 setter。
      Object.defineProperty(target, key, {
        value: copied,
        enumerable: true,
        writable: true,
        configurable: true
      });
      return;
    }
    (target as Record<string, unknown>)[key] = copied;
  });
  return target as T;
};

/** 深冻结仅用于对外 snapshot；内部 runtime 记录不会被冻结。 */
const deeplyFrozenValues = new WeakSet<object>();

export const freezeValue = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (!isObject(value) || deeplyFrozenValues.has(value) || seen.has(value)) return value;
  seen.add(value);
  Object.keys(value).forEach((key) => freezeValue(value[key], seen));
  const frozen = Object.freeze(value);
  deeplyFrozenValues.add(value);
  return frozen;
};

/** 对 fixture 数据执行支持循环引用的结构比较，避免引入深比较依赖。 */
export const valuesEqual = (left: unknown, right: unknown): boolean => {
  const seen = new WeakMap<object, object>();
  const compare = (leftValue: unknown, rightValue: unknown): boolean => {
    if (Object.is(leftValue, rightValue)) return true;
    if (!isObject(leftValue) || !isObject(rightValue)) return false;
    if (leftValue instanceof Date || rightValue instanceof Date) {
      return (
        leftValue instanceof Date &&
        rightValue instanceof Date &&
        leftValue.getTime() === rightValue.getTime()
      );
    }
    const paired = seen.get(leftValue);
    if (paired === rightValue) return true;
    seen.set(leftValue, rightValue);
    if (Array.isArray(leftValue) !== Array.isArray(rightValue)) return false;
    const leftKeys = Object.keys(leftValue);
    const rightKeys = Object.keys(rightValue);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightValue, key) &&
        compare(leftValue[key], rightValue[key])
    );
  };
  return compare(left, right);
};

// endregion

// region errorAndReferences Runtime errors and reference extraction

export const getError = (
  code: WorkflowCommandError['code'],
  message: string
): WorkflowCommandError => ({
  code,
  message
});

/** 每个动态选项字段保留一个引用组，缺省值也参与必填校验。 */
export const getFormOptionReferenceGroups = (value: unknown): unknown[] =>
  Array.isArray(value)
    ? value.flatMap((item: unknown) =>
        isObject(item) &&
        isReferenceOptionFormItem({ type: item.type, listInputType: item.listInputType })
          ? [item.listReference]
          : []
      )
    : [];

/** 子节点清单仅在容器系统字段中具有结构语义。 */
export const isContainerChildListInput = (
  input: FlowNodeInputItemType,
  flowNodeType?: FlowNodeTypeEnum
) =>
  input.key === NodeInputKeyEnum.childrenNodeIdList &&
  input.canEdit !== true &&
  flowNodeType !== undefined &&
  isNestedParentNodeType(flowNodeType);

/** 按节点与字段语义提取引用。容器清单和表单手填选项里的字符串数组是普通数据。 */
export const getInputReferences = (
  input: FlowNodeInputItemType,
  flowNodeType: FlowNodeTypeEnum | undefined
): ReferenceItemValueType[] => {
  if (isContainerChildListInput(input, flowNodeType)) return [];

  const references: ReferenceItemValueType[] = [];
  const includeSecretReferences = workflowInputUsesSecretValues(input, flowNodeType);
  mapWorkflowInputReferenceValues({
    input,
    flowNodeType,
    value: input.value ?? input.defaultValue,
    mapValue: (value, includeCanonicalReferences) => {
      references.push(
        ...getWorkflowReferenceItemsFromValue(value, {
          includeCanonicalReferences,
          includeSecretReferences
        })
      );
      return value;
    }
  });
  return references;
};

// endregion

// region fieldIdentity Runtime field identity helpers

/** 为输入 key 与输出 id 生成统一的稳定字段身份。 */
export const getFieldIdentity = ({
  nodeId,
  field,
  kind
}:
  | {
      nodeId: string;
      field: FlowNodeInputItemType;
      kind: 'input';
    }
  | {
      nodeId: string;
      field: FlowNodeOutputItemType;
      kind: 'output';
    }): WorkflowFieldIdentity => ({
  nodeId,
  key: kind === 'input' ? field.key : field.id,
  kind
});

export const getFieldIdentityKey = ({ nodeId, key, kind }: WorkflowFieldIdentity) =>
  `${nodeId}\0${kind}\0${key}`;

export const parseFieldIdentityKey = (value: string): WorkflowFieldIdentity | undefined => {
  const firstSeparator = value.indexOf('\0');
  const secondSeparator = value.indexOf('\0', firstSeparator + 1);
  if (firstSeparator < 0 || secondSeparator < 0) return undefined;
  const kind = value.slice(firstSeparator + 1, secondSeparator);
  if (kind !== 'input' && kind !== 'output') return undefined;
  return {
    nodeId: value.slice(0, firstSeparator),
    kind,
    key: value.slice(secondSeparator + 1)
  };
};

export const addFieldIdentity = (
  fields: Map<string, WorkflowFieldIdentity>,
  field: WorkflowFieldIdentity
) => {
  fields.set(getFieldIdentityKey(field), field);
};

// endregion
