import { datetimeLocalToUtcTs, utcTsToDatetimeLocal } from '@fastgpt/global/common/string/time';
import type { DatasetTagType } from '@fastgpt/global/core/dataset/type';
import type { ReferenceItemValueType } from '@fastgpt/global/core/workflow/type/io';

export type ConditionRow = {
  tagId: string;
  tagName: string;
  op: string;
  value: string;
  valueIsRef: boolean;
  valueRef?: ReferenceItemValueType;
};

// 操作符选项按 tagType 分组，label 使用 i18n key
export const operatorsByType: Record<string, { value: string; labelKey: string }[]> = {
  string: [
    { value: '$eq', labelKey: 'workflow:tag_filter_op_string_eq' },
    { value: '$ne', labelKey: 'workflow:tag_filter_op_string_ne' },
    { value: '$contains', labelKey: 'workflow:tag_filter_op_contains' },
    { value: '$notContains', labelKey: 'workflow:tag_filter_op_not_contains' },
    { value: '$startsWith', labelKey: 'workflow:tag_filter_op_starts_with' },
    { value: '$endsWith', labelKey: 'workflow:tag_filter_op_ends_with' },
    { value: '$regex', labelKey: 'workflow:tag_filter_op_regex' },
    { value: '$empty', labelKey: 'workflow:tag_filter_op_empty' },
    { value: '$notEmpty', labelKey: 'workflow:tag_filter_op_not_empty' }
  ],
  number: [
    { value: '$eq', labelKey: 'workflow:tag_filter_op_number_eq' },
    { value: '$ne', labelKey: 'workflow:tag_filter_op_number_ne' },
    { value: '$gt', labelKey: 'workflow:tag_filter_op_gt' },
    { value: '$lt', labelKey: 'workflow:tag_filter_op_lt' },
    { value: '$gte', labelKey: 'workflow:tag_filter_op_gte' },
    { value: '$lte', labelKey: 'workflow:tag_filter_op_lte' },
    { value: '$empty', labelKey: 'workflow:tag_filter_op_empty' },
    { value: '$notEmpty', labelKey: 'workflow:tag_filter_op_not_empty' }
  ],
  datetime: [
    { value: '$eq', labelKey: 'workflow:tag_filter_op_string_eq' },
    { value: '$ne', labelKey: 'workflow:tag_filter_op_string_ne' },
    { value: '$gt', labelKey: 'workflow:tag_filter_op_datetime_after' },
    { value: '$lt', labelKey: 'workflow:tag_filter_op_datetime_before' },
    { value: '$empty', labelKey: 'workflow:tag_filter_op_empty' },
    { value: '$notEmpty', labelKey: 'workflow:tag_filter_op_not_empty' }
  ]
};

export const noValueOps = new Set(['$empty', '$notEmpty']);

// 从 JSON 字符串中获取逻辑操作符
export const getLogicOp = (value?: string): 'AND' | 'OR' => {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed?.tags?.$or ? 'OR' : 'AND';
  } catch {
    return 'AND';
  }
};

// 变量引用以 ['$ref', nodeId, outputId] 格式存储，便于后端运行时解析
// datetime 类型的值转为 UTC 毫秒时间戳（number），与存储侧格式保持一致
// 将 GUI 状态序列化为 JSON 字符串
export const serializeFilter = (
  rows: ConditionRow[],
  logic: 'AND' | 'OR' = 'AND',
  tagMap?: Map<string, DatasetTagType>
): string | undefined => {
  if (rows.length === 0) return undefined;
  const conditions = rows
    .filter((r) => r.tagName && r.op)
    .map((r) => {
      let val: any;
      if (noValueOps.has(r.op)) {
        val = null;
      } else if (r.valueIsRef && r.valueRef) {
        val = ['$ref', r.valueRef[0], r.valueRef[1]];
      } else {
        const tagType = tagMap?.get(r.tagId)?.tagType;
        if (tagType === 'datetime' && r.value) {
          val = datetimeLocalToUtcTs(r.value);
        } else {
          val = r.value;
        }
      }
      return { [r.tagName]: { [r.op]: val } };
    });
  if (conditions.length === 0) return undefined;
  const logicKey = logic === 'OR' ? '$or' : '$and';
  return JSON.stringify({ tags: { [logicKey]: conditions } });
};

// 从 JSON 字符串反序列化 GUI 状态
export const deserializeFilter = (value?: string): ConditionRow[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    const arr = parsed?.tags?.$and || parsed?.tags?.$or;
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object') {
      return arr.map((cond: Record<string, Record<string, any>>) => {
        const tagName = Object.keys(cond)[0];
        const opObj = cond[tagName];
        const op = Object.keys(opObj)[0];
        const val = opObj[op];

        // 检测变量引用格式 ['$ref', nodeId, outputId]
        if (Array.isArray(val) && val.length === 3 && val[0] === '$ref') {
          return {
            tagId: '',
            tagName,
            op,
            value: '',
            valueIsRef: true,
            valueRef: [val[1], val[2]] as ReferenceItemValueType
          };
        }
        return {
          tagId: '',
          tagName,
          op,
          value:
            val == null ? '' : typeof val === 'number' ? utcTsToDatetimeLocal(val) : String(val),
          valueIsRef: false,
          valueRef: undefined
        };
      });
    }
  } catch {}
  return [];
};
