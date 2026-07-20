import {
  AuditEventEnum,
  AdminAuditEventEnum
} from '../../../../../../support/user/audit/constants';
import { AdminAuditListBodySchema } from '../../../../../../openapi/admin/support/user/audit/api';
import { describe, expect, it } from 'vitest';

describe('AdminAuditListBodySchema', () => {
  it('accepts admin events', () => {
    expect(
      AdminAuditListBodySchema.safeParse({
        pageNum: 1,
        pageSize: 20,
        events: [AdminAuditEventEnum.ADMIN_LOGIN]
      }).success
    ).toBe(true);
  });

  it('rejects team events and extra fields', () => {
    expect(
      AdminAuditListBodySchema.safeParse({
        pageNum: 1,
        pageSize: 20,
        events: [AuditEventEnum.LOGIN]
      }).success
    ).toBe(false);
    expect(
      AdminAuditListBodySchema.safeParse({ pageNum: 1, pageSize: 20, unexpected: true }).success
    ).toBe(false);
  });
});
