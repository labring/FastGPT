import { buildPinyinNameSortKey } from '../../../common/string/sortKey';

/**
 * 为知识库集合名生成可按默认二进制/UTF-8 序直接索引排序的规范化拼音排序键（普通词组模式，非姓氏模式）。
 */
export const buildDatasetCollectionNameSortKey = (name: unknown): string =>
  buildPinyinNameSortKey(name, { mode: 'normal' });
