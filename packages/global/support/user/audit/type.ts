import type { SourceMemberType } from '../type';
import type { AdminAuditEventEnum, AuditEventEnum } from './constants';

export type TeamAuditEvent = `${AuditEventEnum}`;
export type AdminAuditEvent = `${AdminAuditEventEnum}`;
export type AuditEvent = TeamAuditEvent | AdminAuditEvent;

export type AuditSchemaType<TEvent extends AuditEvent = AuditEvent> = {
  _id: string;
  tmbId: string;
  teamId: string;
  timestamp: Date;
  event: TEvent;
  metadata?: Record<string, any>;
};

export type AuditListItemType<TEvent extends AuditEvent = AuditEvent> = {
  _id: string;
  sourceMember: SourceMemberType;
  event: TEvent;
  timestamp: Date;
  metadata: Record<string, any>;
};

export type TeamAuditListItemType = AuditListItemType<TeamAuditEvent>;
export type AdminAuditListItemType = AuditListItemType<AdminAuditEvent>;
