import type { StandardSubLevelEnum, SubModeEnum } from '../sub/constants';
import { SubTypeEnum } from '../sub/constants';
import type { BillPayWayEnum, BillStatusEnum, BillTypeEnum } from './constants';
import type { TeamInvoiceHeaderType } from '../../user/team/type';

export type BillSchemaType = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  orderId: string;
  status: `${BillStatusEnum}`;
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
  refundData?: {
    amount: number;
    refundId: string;
    refundTime: Date;
  };
};

export type ChatNodeUsageType = {
  inputTokens?: number;
  outputTokens?: number;
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

export type AIPointsPriceOption = {
  type: 'points';
  points: number;
};

export type DatasetPriceOption = {
  type: 'dataset';
  size: number;
  month: number;
};

export type PriceOption = AIPointsPriceOption | DatasetPriceOption;
