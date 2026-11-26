/** 单选与多选候选项个数的最大上限 */
export const MAX_SELECT_OPTION_COUNT = 200;

/** 单个候选项值的最大字符长度上限 */
export const MAX_SELECT_OPTION_LENGTH = 100;

/**
 * 将单个选项文本按最大长度（默认 100）截断。
 *
 * 与前端 `<Input maxLength={100} />` 保持相同的 UTF-16 码元计数口径；
 * 当截断边界恰好落在代理对（Surrogate Pair，如 Emoji）的高代理项上时，
 * 自动回退 1 个码元，避免产生孤立代理项乱码或导致 JSON/数据库序列化失败。
 */
export const truncateSelectOptionText = (value: string): string => {
  if (value.length <= MAX_SELECT_OPTION_LENGTH) return value;

  const lastCode = value.charCodeAt(MAX_SELECT_OPTION_LENGTH - 1);
  // 0xD800 - 0xDBFF 为 UTF-16 高代理项，单独保留末尾高代理项会产生非法 Unicode 字符
  const end =
    lastCode >= 0xd800 && lastCode <= 0xdbff
      ? MAX_SELECT_OPTION_LENGTH - 1
      : MAX_SELECT_OPTION_LENGTH;
  return value.slice(0, end);
};
