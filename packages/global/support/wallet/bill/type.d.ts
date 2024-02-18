import { SubModeEnum, SubTypeEnum } from '../sub/constants';
import { BillTypeEnum } from './constants';

export type BillSchemaType = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  orderId: string;
  status: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED';
  type: `${PayType}`;

  price: number;
  payWay: 'balance' | 'wx';
};
