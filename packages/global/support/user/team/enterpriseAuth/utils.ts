const UnifiedCreditCodeChars = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const UnifiedCreditCodeWeights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
const UnifiedCreditCodePattern = /^[0-9A-HJ-NP-RTUWXY]{18}$/;
const BankAccountPattern = /^\d+$/;

export const normalizeUnifiedCreditCode = (code: string) => code.trim().toUpperCase();

export const normalizeBankAccount = (account: string) => account.replace(/\s+/g, '');

/**
 * 按 GB 32100-2015 校验统一社会信用代码第 18 位校验码。
 */
export const isUnifiedCreditCode = (code: string) => {
  const normalizedCode = normalizeUnifiedCreditCode(code);

  if (!UnifiedCreditCodePattern.test(normalizedCode)) return false;

  const sum = UnifiedCreditCodeWeights.reduce((total, weight, index) => {
    const value = UnifiedCreditCodeChars.indexOf(normalizedCode[index]);
    return total + value * weight;
  }, 0);
  const checkValue = (() => {
    const value = 31 - (sum % 31);
    if (value === 31) return 0;
    return value;
  })();

  return normalizedCode[17] === UnifiedCreditCodeChars[checkValue];
};

/**
 * 校验企业银行账号：去除空格后需为纯数字，不限制账号长度。
 */
export const isBankAccount = (account: string) => {
  const normalizedAccount = normalizeBankAccount(account);

  return BankAccountPattern.test(normalizedAccount);
};
