import type { SourceMemberType } from '../type';
import type { AuditEventEnum } from './constants';

export type TeamAuditSchemaType = {
  _id: string;
  teamId: string;
  timestamp: Date;
  event: `${AuditEventEnum}`;
  metadata?: Record<string, string>;
} & (
  | {
      tmbId: string;
      scope?: 'member';
    }
  | {
      tmbId?: never;
      scope: 'system';
    }
);
export type TeamAuditListItemType = {
  _id: string;
  sourceMember: SourceMemberType;
  event: `${AuditEventEnum}`;
  timestamp: Date;
  metadata: Record<string, string>;
};
