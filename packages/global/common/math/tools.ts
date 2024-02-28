export const formatNumber = (num: number, digit = 1e4) => Math.round(num * digit) / digit;

export const formatNumber2Million = (num: number) => Math.round(num / 1000000);
export const formatNumber2Thousand = (num: number) => Math.round(num / 1000);
