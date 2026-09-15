import type { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

export type MetadataProcessor = (metadata: any, t: any) => any;
export const specialProcessors: Partial<Record<AdminAuditEventEnum, MetadataProcessor>> = {};
