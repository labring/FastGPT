export const formatNumber = (num: number, digit = 1e4) => Math.round(num * digit) / digit;

export const formatNumber2Million = (num: number) => Math.round(num / 1000000);
export const formatNumber2Thousand = (num: number) => Math.round(num / 1000);

/** Format token counts with compact K/M/B units and at most two decimals. */
export const formatTokenCount = (num: number) => {
  if (!Number.isFinite(num)) return '-';

  const units = [
    { limit: 1e9, suffix: 'B' },
    { limit: 1e6, suffix: 'M' },
    { limit: 1e3, suffix: 'K' },
    { limit: 1, suffix: '' }
  ];

  // 先按原始值选单位，再用保留两位后的值复选一次：999999 / 1e3 保留两位是 1000，
  // 直接渲染会得到 "1000K"，进位后必须提升到下一个单位。
  let picked = units.find(({ limit }) => Math.abs(num) >= limit) ?? units[units.length - 1];
  const pickedIndex = units.indexOf(picked);
  if (pickedIndex > 0 && Math.abs(Number((num / picked.limit).toFixed(2))) >= 1000) {
    picked = units[pickedIndex - 1];
  }

  return `${Number((num / picked.limit).toFixed(2))}${picked.suffix}`;
};
