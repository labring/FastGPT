import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  warn: vi.fn(),
  serviceEnv: {
    CRM_API_URL: undefined as string | undefined,
    CRM_API_KEY: undefined as string | undefined
  }
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: { patch: mocks.patch }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ warn: mocks.warn }),
  LogCategories: { MODULE: { USER: { ACCOUNT: ['user', 'account'] } } }
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mocks.serviceEnv
}));

import { reportCRMVisitorIdentity } from '@fastgpt/service/support/marketing/attribution';

describe('reportCRMVisitorIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceEnv.CRM_API_URL = undefined;
    mocks.serviceEnv.CRM_API_KEY = undefined;
  });

  it('skips reporting when CRM_API_URL is not configured', async () => {
    await reportCRMVisitorIdentity({
      visitorId: 'visitor-1',
      userId: 'user-1',
      username: 'user@example.com'
    });

    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('skips reporting when visitor_id is missing', async () => {
    mocks.serviceEnv.CRM_API_URL = 'https://crm.example.com/api/v1';
    mocks.serviceEnv.CRM_API_KEY = 'crm-key';

    await reportCRMVisitorIdentity({
      userId: 'user-1',
      username: 'user@example.com'
    });

    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('reports the FastGPT identity using the visitor_id', async () => {
    mocks.serviceEnv.CRM_API_URL = 'https://crm.example.com/api/v1/';
    mocks.serviceEnv.CRM_API_KEY = 'crm-key';

    await reportCRMVisitorIdentity({
      visitorId: 'visitor/1',
      userId: 'user-1',
      username: '13800138000',
      contact: 'user@example.com'
    });

    expect(mocks.patch).toHaveBeenCalledWith(
      'https://crm.example.com/api/v1/contacts/visitor/visitor%2F1/identity',
      {
        cloud_user_id: 'user-1',
        cloud_username: '13800138000',
        cloud_user_email: 'user@example.com',
        name: '13800138000',
        email: 'user@example.com'
      },
      {
        headers: { 'X-API-Key': 'crm-key' },
        timeout: 5000
      }
    );
  });

  it('does not fail login when CRM reporting fails', async () => {
    mocks.serviceEnv.CRM_API_URL = 'https://crm.example.com/api/v1';
    mocks.serviceEnv.CRM_API_KEY = 'crm-key';
    mocks.patch.mockRejectedValueOnce(new Error('CRM unavailable'));

    await expect(
      reportCRMVisitorIdentity({
        visitorId: 'visitor-1',
        userId: 'user-1',
        username: 'user@example.com'
      })
    ).resolves.toBeUndefined();

    expect(mocks.warn).toHaveBeenCalledWith(
      'CRM visitor identity report failed',
      expect.objectContaining({ visitorId: 'visitor-1', userId: 'user-1' })
    );
  });
});
