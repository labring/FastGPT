export const formatNumber = (num: number, digit = 1e4) => Math.round(num * digit) / digit;
