import { POST } from '@/web/admin/common/request';
import type {
  AdminAuditListBodyType,
  AdminAuditListResponseType
} from '@fastgpt/global/openapi/admin/system/audit/api';

export const getOperationLogs = (props: AdminAuditListBodyType) =>
  POST<AdminAuditListResponseType>('/proApi/admin/system/audit/list', props);
