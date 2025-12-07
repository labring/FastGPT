import type { PriceOption } from './type';

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
