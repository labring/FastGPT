import type { SourceMemberType } from '../user/type';
import type { AuditEventEnum } from './constants';

export type OperationLogSchema = {
  _id: string;
  tmbId: string;
  teamId: string;
  timestamp: Date;
  event: `${AuditEventEnum}`;
  metadata?: Record<string, string>;
};

export type OperationListItemType = {
  _id: string;
  sourceMember: SourceMemberType;
  event: `${AuditEventEnum}`;
  timestamp: Date;
  metadata: Record<string, string>;
};
