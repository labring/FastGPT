import { type VariableItemType, VariableItemTypeSchema } from '../type';
import {
  type VariableInputEnum,
  variableMap,
  WorkflowIOValueTypeEnum
} from '../../workflow/constants';

const workflowValueTypes = new Set(Object.values(WorkflowIOValueTypeEnum));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 将变量的 valueType 归一为可持久化值。
 *
 * 已有合法值保持不变；空值按输入控件的默认类型补齐；未知控件或非法值降级为 any。
 */
export const normalizeVariableValueType = ({
  type,
  valueType
}: {
  type: unknown;
  valueType: unknown;
}): WorkflowIOValueTypeEnum => {
  if (valueType !== undefined && valueType !== null && valueType !== '') {
    return typeof valueType === 'string' &&
      workflowValueTypes.has(valueType as WorkflowIOValueTypeEnum)
      ? (valueType as WorkflowIOValueTypeEnum)
      : WorkflowIOValueTypeEnum.any;
  }

  if (typeof type !== 'string') return WorkflowIOValueTypeEnum.any;
  return variableMap[type as VariableInputEnum]?.defaultValueType ?? WorkflowIOValueTypeEnum.any;
};

/**
 * 归一化变量列表并通过业务 Zod schema 校验。
 *
 * 非对象、缺少必填字段等不可安全修复的数据会直接抛出 ZodError，阻止脏数据落库。
 */
export const normalizeAndParseVariableList = (variableList: unknown): VariableItemType[] =>
  VariableItemTypeSchema.array().parse(
    Array.isArray(variableList)
      ? variableList.map((variable) =>
          isRecord(variable)
            ? {
                ...variable,
                valueType: normalizeVariableValueType({
                  type: variable.type,
                  valueType: variable.valueType
                })
              }
            : variable
        )
      : variableList
  );
