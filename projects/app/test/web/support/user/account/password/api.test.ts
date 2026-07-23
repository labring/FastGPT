import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { POST } from '@/web/common/api/request';
import {
  authorizePasswordChange,
  createPasswordVerification,
  updatePassword
} from '@/web/support/user/account/password/api';

vi.mock('@/web/common/api/request', () => ({
  POST: vi.fn()
}));

describe('password account API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates server-bound verification material', async () => {
    const body = { method: 'oldPassword', payload: {} } as const;

    await createPasswordVerification(body);

    expect(POST).toHaveBeenCalledWith(
      '/proApi/support/user/account/password/verification/create',
      body
    );
  });

  it('requests authorization from recent login', async () => {
    const body = { source: 'recentLogin' } as const;

    await authorizePasswordChange(body);

    expect(POST).toHaveBeenCalledWith('/proApi/support/user/account/password/authorization', body);
  });

  it('hashes the raw password before submitting the short-lived token', async () => {
    await updatePassword({
      newPassword: 'Strong-password-123',
      passwordChangeToken: 'password-change-token'
    });

    expect(POST).toHaveBeenCalledWith('/support/user/account/password/update', {
      newPsw: hashStr('Strong-password-123'),
      passwordChangeToken: 'password-change-token'
    });
  });
});
