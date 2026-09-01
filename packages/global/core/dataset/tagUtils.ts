import type { CollectionTagValueType } from './type';

/** 标签值去重/列表 key：区分 number 2 与 string "2"。 */
export const collectionTagValueKey = (value: string | number) =>
  typeof value === 'number' ? `n:${value}` : `s:${value}`;

/** 数字按大小、其余按 zh-CN 字典序。前后端筛选项展示共用。 */
export const sortCollectionTagValues = <T extends string | number>(values: T[]): T[] =>
  [...values].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'zh-CN');
  });

/** 筛选项只保留非空字符串和有限数字。 */
export const isUsableCollectionTagFilterValue = (value: unknown): value is string | number => {
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return false;
};

/** 新格式 { tagId, value }；旧字符串标签排除。 */
export const isCollectionTagValue = (item: unknown): item is CollectionTagValueType =>
  !!item && typeof item === 'object' && !Array.isArray(item) && 'tagId' in item && 'value' in item;
