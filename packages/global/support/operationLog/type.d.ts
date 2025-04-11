import { operationLogTemplateCodeEnum } from './constants';

export type OperationLogSchema = {
  _id: string;
  tmbId: string;
  teamId: string;
  timestamp: Date;
  event: `${operationLogTemplateCodeEnum}`;
  metadata?: Record<string, string>;
};

export type OperationLogType = {
  _id: string;
  name: string;
  operationLog: string;
  timestamp: Date;
  event: `${operationLogTemplateCodeEnum}`;
  metadata: Record<string, string>;
};
