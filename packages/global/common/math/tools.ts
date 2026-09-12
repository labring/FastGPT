export const formatNumber = (num: number, digit = 1e4) => Math.round(num * digit) / digit;

export const formatNumber2Million = (num: number) => Math.round(num / 1000000);
export const formatNumber2Thousand = (num: number) => Math.round(num / 1000);

/** Format token counts with compact K/M/B units and at most two decimals. */
export const formatTokenCount = (num: number) => {
  if (!Number.isFinite(num)) return '-';
  const abs = Math.abs(num);
  const unit = abs >= 1e9 ? 'B' : abs >= 1e6 ? 'M' : abs >= 1e3 ? 'K' : '';
  const divisor = unit === 'B' ? 1e9 : unit === 'M' ? 1e6 : unit === 'K' ? 1e3 : 1;
  return `${Number((num / divisor).toFixed(2))}${unit}`;
};
