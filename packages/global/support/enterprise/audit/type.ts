import type {
  EnterpriseAuditActionEnum,
  EnterpriseAuditActorTypeEnum,
  EnterpriseAuditResourceTypeEnum,
  EnterpriseAuditResultEnum
} from './constants';

export type EnterpriseAuditActor = {
  type: `${EnterpriseAuditActorTypeEnum}`;
  userId?: string;
  teamId?: string;
  tmbId?: string;
  apiKeyId?: string;
  name?: string;
};

export type EnterpriseAuditResource = {
  type: `${EnterpriseAuditResourceTypeEnum}`;
  id?: string;
  name?: string;
};

export type EnterpriseAuditLogSchemaType = {
  _id: string;
  timestamp: Date;
  action: `${EnterpriseAuditActionEnum}` | string;
  result: `${EnterpriseAuditResultEnum}`;
  actor: EnterpriseAuditActor;
  resource?: EnterpriseAuditResource;
  requestId?: string;
  clientIp?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};
