import { pinyin } from 'pinyin-pro';

const ASCII_LETTER_RE = /^[A-Za-z]$/;
const ASCII_DIGIT_RE = /^[0-9]$/;
const HAN_CHAR_RE = /^\p{Script=Han}$/u;
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]+/g;
const MULTI_SPACE_RE = /\s+/g;

/** 分隔主排序键与次级原文键，码点 (0x1F) 小于空格 (0x20) 与所有可见字符且避开 NUL 字节。 */
const SORT_KEY_SEPARATOR = '\x1f';
/** 控制单个索引键长度，确保即使历史脏数据很长也远低于 MongoDB 4.0 的 1024B 索引键上限。 */
const MAX_PRIMARY_KEY_LEN = 120;
const MAX_TIEBREAK_LEN = 80;

const normalizeWhitespace = (value: string) =>
  value.replace(CONTROL_CHAR_RE, ' ').replace(MULTI_SPACE_RE, ' ').trim();

/**
 * 为团队成员名生成可按默认二进制/UTF-8 序直接索引排序的规范化排序键。
 *
 * 排序分桶与规则：
 * - `0:<initial>:0:<pinyin>\x1f<lower>` 可转为拼音的汉字：按首字母 A-Z 分组，同首字母内排在英文之前，
 *   音节间以空格分隔以保留单字拼音边界（例如 `李伟(li wei)` < `林安(lin an)` < `刘安(liu an)`）。
 * - `0:<initial>:1:<lower>\x1f<lower>` 英文字母 (A-Z) 开头：按首字母 A-Z 分组，同首字母内排在中文之后。
 * - `1:<primary>\x1f<lower>` ASCII 数字 (0-9) 开头：排在所有字母与汉字之后。
 * - `2:<primary>\x1f<lower>` 其他字符（符号、Emoji、非中英文字、无拼音生僻字或空串）：排在数字之后。
 */
export const buildTeamMemberNameSortKey = (name: unknown): string => {
  const trimmed = typeof name === 'string' ? normalizeWhitespace(name) : '';
  if (!trimmed) {
    return '2:';
  }

  const lower = trimmed.toLowerCase();
  const firstCodePoint = trimmed.codePointAt(0);
  const firstChar = firstCodePoint !== undefined ? String.fromCodePoint(firstCodePoint) : '';

  const tokens = pinyin(trimmed, {
    toneType: 'none',
    mode: 'surname',
    type: 'array',
    nonZh: 'consecutive',
    v: true
  });
  const primary = normalizeWhitespace(tokens.join(' ').toLowerCase());
  const firstTokenChar = (tokens[0] ?? '').trim().charAt(0).toLowerCase();

  const primaryPart = (primary || lower).slice(0, MAX_PRIMARY_KEY_LEN);
  const tiebreakPart = lower.slice(0, MAX_TIEBREAK_LEN);

  // 同首字母内中文优先于英文：0:<a-z>:0:... < 0:<a-z>:1:...
  if (HAN_CHAR_RE.test(firstChar) && ASCII_LETTER_RE.test(firstTokenChar)) {
    return `0:${firstTokenChar}:0:${primaryPart}${SORT_KEY_SEPARATOR}${tiebreakPart}`;
  }
  if (ASCII_LETTER_RE.test(firstChar)) {
    return `0:${firstChar.toLowerCase()}:1:${primaryPart}${SORT_KEY_SEPARATOR}${tiebreakPart}`;
  }
  if (ASCII_DIGIT_RE.test(firstChar)) {
    return `1:${primaryPart}${SORT_KEY_SEPARATOR}${tiebreakPart}`;
  }
  return `2:${primaryPart}${SORT_KEY_SEPARATOR}${tiebreakPart}`;
};

/** 校验落库的 nameSortKey 是否满足当前编码格式。 */
export const isValidTeamMemberNameSortKey = (value: unknown): value is string =>
  typeof value === 'string' && (/^0:[a-z]:[01]:/.test(value) || /^[12]:/.test(value));
