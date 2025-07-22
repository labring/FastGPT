export const getComputedMonth = (month: number) => {
  if (month >= 200) return 12;
  if (month >= 100) return 6;
  if (month >= 50) return 3;
  return 1;
};
