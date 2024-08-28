import { StandardSubLevelEnum, SubModeEnum, SubTypeEnum } from '../sub/constants';
import { BillPayWayEnum, BillTypeEnum } from './constants';
import { TeamInvoiceHeaderType } from '../../user/team/type';
export type BillSchemaType = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  orderId: string;
  status: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED';
  type: BillTypeEnum;
  price: number;
  hasInvoice: boolean;
  metadata: {
    payWay: `${BillPayWayEnum}`;
    subMode?: `${SubModeEnum}`;
    standSubLevel?: `${StandardSubLevelEnum}`;
    month?: number;
    datasetSize?: number;
    extraPoints?: number;
  };
};

export type ChatNodeUsageType = {
  tokens?: number;
  totalPoints: number;
  moduleName: string;
  model?: string;
};

export type InvoiceType = {
  amount: number;
  billIdList: string[];
} & TeamInvoiceHeaderType;

export type InvoiceSchemaType = {
  _id: string;
  teamId: string;
  status: 1 | 2;
  createTime: Date;
  finishTime?: Date;
  file?: Buffer;
} & InvoiceType;
