import type { ReferenceValueType } from '@fastgpt/global/core/workflow/type/io';
import {
  formatCollectionFilterMatchParam,
  isDatasetTagFilterValue,
  parseMaybeJson
} from '@fastgpt/global/core/dataset/workflowTagFilter';
import { adaptSangforCollectionFilterMatch } from '../../../../thirdProvider/sangfor/workflowTagAdapter';

/**
 * 格式化工作流运行时的 collectionFilterMatch 参数。
 *
 * 职责：作为工作流运行时的标签过滤调度入口，分发原生 AST 表单条件与三方检索载荷适配。
 * 1. FastGPT 原生结构化条件行（表单 AST）：解析行内 2 元组引用并序列化，立即返回，零三方开销；
 * 2. 三方检索载荷适配（如 Sangfor 下发的 tags $ref 3 元组）：单趟解析引用并动态替换；
 * 3. 兜底透传：普通字符串原样返回，非检索对象转 JSON，无意义原始值丢弃。
 */
export const formatWorkflowCollectionFilterMatch = ({
  value,
  resolveReference = () => undefined
}: {
  value: unknown;
  resolveReference?: (ref: ReferenceValueType) => unknown;
}): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;

  const parsed = typeof value === 'string' ? parseMaybeJson(value) : value;

  // 1. FastGPT 原生结构化条件行（表单 AST）：解析 2 元组引用后序列化
  if (isDatasetTagFilterValue(parsed)) {
    return formatCollectionFilterMatchParam({
      value: parsed,
      resolveReference
    });
  }

  // 2. 三方检索载荷适配（如 Sangfor）
  const adapted = adaptSangforCollectionFilterMatch({
    value,
    parsedValue: parsed,
    resolveReference
  });
  if (adapted !== undefined) return adapted;

  // 3. 兜底透传：字符串原样返回，非检索对象转 JSON
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return undefined;
};
