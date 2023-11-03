/* bill common  */
import { PRICE_SCALE } from './constants';
import { BillItemType, BillSchema } from './type';

/**
 * dataset price / PRICE_SCALE = real price
 */
export const formatPrice = (val = 0, multiple = 1) => {
  return Number(((val / PRICE_SCALE) * multiple).toFixed(10));
};

export const adaptBill = (bill: BillSchema): BillItemType => {
  return {
    id: bill._id,
    source: bill.source,
    time: bill.time,
    total: formatPrice(bill.total),
    appName: bill.appName,
    list: bill.list
  };
};
