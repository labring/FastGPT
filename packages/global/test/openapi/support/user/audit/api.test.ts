import { AuditEventEnum, AdminAuditEventEnum } from '../../../../../support/user/audit/constants';
import { TeamAuditListBodySchema } from '../../../../../openapi/support/user/audit/api';
import { describe, expect, it } from 'vitest';

describe('TeamAuditListBodySchema', () => {
  it('accepts team events', () => {
    expect(
      TeamAuditListBodySchema.safeParse({
        pageNum: 1,
        pageSize: 20,
        events: [AuditEventEnum.LOGIN]
      }).success
    ).toBe(true);
  });

  it('rejects admin events and extra fields', () => {
    expect(
      TeamAuditListBodySchema.safeParse({
        pageNum: 1,
        pageSize: 20,
        events: [AdminAuditEventEnum.ADMIN_LOGIN]
      }).success
    ).toBe(false);
    expect(
      TeamAuditListBodySchema.safeParse({ pageNum: 1, pageSize: 20, unexpected: true }).success
    ).toBe(false);
  });
});
