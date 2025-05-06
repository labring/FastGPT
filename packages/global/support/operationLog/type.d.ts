import type { SourceMemberType } from '../user/type';
import type { OperationLogEventEnum } from './constants';

export type OperationLogSchema = {
  _id: string;
  tmbId: string;
  teamId: string;
  timestamp: Date;
  event: `${OperationLogEventEnum}`;
  metadata?: Record<string, string>;
};

export type OperationListItemType = {
  _id: string;
  sourceMember: SourceMemberType;
  event: `${OperationLogEventEnum}`;
  timestamp: Date;
  metadata: Record<string, string>;
};
