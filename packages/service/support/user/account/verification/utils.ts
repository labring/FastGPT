/** 将用户输入转成可安全用于锚定正则的字面量。 */
export const escapeVerificationCodeForRegExp = (code: string) =>
  code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 构造兼容历史验证码大小写行为的精确匹配条件。 */
export const buildVerificationCodeFilter = ({
  code,
  caseInsensitive = false
}: {
  code: string;
  caseInsensitive?: boolean;
}) =>
  caseInsensitive
    ? { $regex: new RegExp(`^${escapeVerificationCodeForRegExp(code)}$`, 'i') }
    : code;
