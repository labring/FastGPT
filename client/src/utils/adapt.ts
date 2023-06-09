import { formatPrice } from './user';
import dayjs from 'dayjs';
import type { BillSchema } from '../types/mongoSchema';
import type { UserBillType } from '@/types/user';

export const adaptBill = (bill: BillSchema): UserBillType => {
  return {
    id: bill._id,
    type: bill.type,
    modelName: bill.modelName,
    time: bill.time,
    textLen: bill.textLen,
    tokenLen: bill.tokenLen,
    price: formatPrice(bill.price)
  };
};
