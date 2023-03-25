import { formatPrice } from './user';
import dayjs from 'dayjs';
import type { BillSchema } from '../types/mongoSchema';
import type { UserBillType } from '@/types/user';

export const adaptBill = (bill: BillSchema): UserBillType => {
  return {
    id: bill._id,
    userId: bill.userId,
    chatId: bill.chatId,
    time: dayjs(bill.time).format('YYYY/MM/DD HH:mm:ss'),
    textLen: bill.textLen,
    tokenLen: bill.tokenLen,
    price: formatPrice(bill.price)
  };
};
