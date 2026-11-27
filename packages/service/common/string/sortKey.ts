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

export type PinyinSortKeyMode = 'normal' | 'surname';

const normalizeWhitespace = (value: string) =>
  value.replace(CONTROL_CHAR_RE, ' ').replace(MULTI_SPACE_RE, ' ').trim();

/**
 * 为名称生成可按默认二进制/UTF-8 序直接索引排序的规范化拼音排序键。
 *
 * 排序分桶与规则：
 * - `0:<initial>:0:<pinyin>\x1f<lower>` 可转为拼音的汉字开头：按首字母 A-Z 分组，同首字母内排在英文之前，
 *   音节间以空格分隔以保留单字拼音边界（例如 `李伟(li wei)` < `林安(lin an)` < `刘安(liu an)`）。
 * - `0:<initial>:1:<lower>` ASCII 字母 (A-Z) 开头：按首字母 A-Z 分组，同首字母内排在中文之后，直接按规范化小写原名字典序比较。
 * - `1:<lower>` ASCII 数字 (0-9) 开头：排在所有字母与汉字之后，按规范化小写原名字典序比较。
 * - `2:<lower>` 其他字符（符号、Emoji、非中英文字、无拼音生僻字或空串）：排在数字之后，按规范化小写原名字典序比较。
 *
 * 仅汉字开头调用拼音转写，避免非汉字开头的混合名称（如 `A中说明` / `2阿文档` / `#中测试`）因插空格导致字典序倒置。
 *
 * @param name 待排序的原始名称
 * @param options.mode 多音字模式：`surname` 适用于人名/成员名，`normal`（默认）适用于普通词组与文件名
 */
export const buildPinyinNameSortKey = (
  name: unknown,
  options?: { mode?: PinyinSortKeyMode }
): string => {
  const trimmed = typeof name === 'string' ? normalizeWhitespace(name) : '';
  if (!trimmed) {
    return '2:';
  }

  const lower = trimmed.toLowerCase();
  const firstCodePoint = trimmed.codePointAt(0);
  const firstChar = firstCodePoint !== undefined ? String.fromCodePoint(firstCodePoint) : '';
  const lowerPrimary = lower.slice(0, MAX_PRIMARY_KEY_LEN);

  // 同首字母内中文优先于英文：0:<a-z>:0:... < 0:<a-z>:1:...
  if (HAN_CHAR_RE.test(firstChar)) {
    const tokens = pinyin(trimmed, {
      toneType: 'none',
      mode: options?.mode ?? 'normal',
      type: 'array',
      nonZh: 'consecutive',
      v: true
    });
    const firstTokenChar = (tokens[0] ?? '').trim().charAt(0).toLowerCase();
    if (ASCII_LETTER_RE.test(firstTokenChar)) {
      const primary = normalizeWhitespace(tokens.join(' ').toLowerCase());
      const primaryPart = (primary || lower).slice(0, MAX_PRIMARY_KEY_LEN);
      const tiebreakPart = lower.slice(0, MAX_TIEBREAK_LEN);
      return `0:${firstTokenChar}:0:${primaryPart}${SORT_KEY_SEPARATOR}${tiebreakPart}`;
    }
    return `2:${lowerPrimary}`;
  }

  if (ASCII_LETTER_RE.test(firstChar)) {
    return `0:${firstChar.toLowerCase()}:1:${lowerPrimary}`;
  }
  if (ASCII_DIGIT_RE.test(firstChar)) {
    return `1:${lowerPrimary}`;
  }
  return `2:${lowerPrimary}`;
};

/** 校验落库的 nameSortKey 是否满足当前拼音排序键编码格式。 */
export const isValidPinyinNameSortKey = (value: unknown): value is string =>
  typeof value === 'string' && (/^0:[a-z]:[01]:/.test(value) || /^[12]:/.test(value));
