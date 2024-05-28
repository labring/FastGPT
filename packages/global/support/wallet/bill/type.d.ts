import { StandardSubLevelEnum, SubModeEnum, SubTypeEnum } from '../sub/constants';
import { BillPayWayEnum, BillTypeEnum } from './constants';

export type BillSchemaType = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  orderId: string;
  status: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED';
  type: `${BillTypeEnum}`;
  price: number;
  hasInvoice: boolean;
  metadata: {
    payWay: `${BillPayWayEnum}`;
    subMode?: `${SubModeEnum}`;
    standSubLevel?: `${StandardSubLevelEnum}`;
    month?: number;
    datasetSize?: number;
    extraPoints?: number;
    invoice: boolean;
  };
};

export type ChatNodeUsageType = {
  tokens?: number;
  totalPoints: number;
  moduleName: string;
  model?: string;
};
