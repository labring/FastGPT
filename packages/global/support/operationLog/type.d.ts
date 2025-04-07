import { operationLogTemplateCodeEnum } from './constants';

export type operationLogSchema = {
  _id: string;
  tmbId: string;
  teamId: string;
  timestamp: Date;
  event: `${operationLogTemplateCodeEnum}`;
  metadata?: Record<string, string>;
};

export type operationLogType = {
  _id: string;
  name: string;
  operationLog: string;
  timestamp: Date;
  event: `${operationLogTemplateCodeEnum}`;
};
