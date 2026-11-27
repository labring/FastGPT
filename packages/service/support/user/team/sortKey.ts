import { buildPinyinNameSortKey } from '../../../common/string/sortKey';

/**
 * 为团队成员名生成可按默认二进制/UTF-8 序直接索引排序的规范化拼音排序键（使用姓氏多音字模式）。
 */
export const buildTeamMemberNameSortKey = (name: unknown): string =>
  buildPinyinNameSortKey(name, { mode: 'surname' });
