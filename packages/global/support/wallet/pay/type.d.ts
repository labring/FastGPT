import { SubModeEnum, SubTypeEnum } from '../sub/constants';
import { PayTypeEnum } from './constants';

export type PaySchema = {
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

  subMetadata: {};
};
