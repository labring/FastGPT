import type { PriceOption } from './type';

// 根据积分获取月份
export const getMonthByPoints = (points: number) => {
  if (points >= 200) return 12;
  if (points >= 100) return 6;
  if (points >= 50) return 3;
  return 1;
};

// 根据月份获取积分下限
export const getMinPointsByMonth = (month: number): number => {
  switch (month) {
    case 12:
      return 200;
    case 6:
      return 100;
    case 3:
      return 50;
    case 1:
      return 1;
    default:
      return 1;
  }
};

// 计算额外资源包的所需付款价格
export const calculatePrice = (unitPrice: number, option: PriceOption) => {
  switch (option.type) {
    case 'points':
      return unitPrice * option.points * 1;
    case 'dataset':
      return unitPrice * option.size * option.month;
    default:
      throw new Error('Invalid price option type');
  }
};
