import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  post: vi.fn(),
  warn: vi.fn(),
  serviceEnv: {
    CRM_API_URL: undefined as string | undefined,
    CRM_API_KEY: undefined as string | undefined
  }
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: { patch: mocks.patch, post: mocks.post }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ warn: mocks.warn }),
  LogCategories: { MODULE: { USER: { ACCOUNT: ['user', 'account'] } } }
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mocks.serviceEnv
}));

import {
  CRMLifecycleEvent,
  reportCRMEnterpriseVerification,
  reportCRMVisitorIdentity,
  reportCRMVisitorLifecycle,
  resolveCRMVisitorId
} from '@fastgpt/service/support/marketing/attribution';

describe('resolveCRMVisitorId', () => {
  it('prefers the visitor id stored on the user', () => {
    expect(
      resolveCRMVisitorId({
        storedFastgptSem: { visitor_id: 'stored-visitor' },
        incomingVisitorId: 'incoming-visitor'
      })
    ).toEqual({
      visitorId: 'stored-visitor',
      shouldPersist: false,
      fastgptSem: { visitor_id: 'stored-visitor' }
    });
  });

  it('uses and persists the incoming visitor id when the user has none', () => {
    expect(
      resolveCRMVisitorId({
        storedFastgptSem: { keyword: 'FastGPT' },
        incomingVisitorId: ' incoming-visitor '
      })
    ).toEqual({
      visitorId: 'incoming-visitor',
      shouldPersist: true,
      fastgptSem: { keyword: 'FastGPT', visitor_id: 'incoming-visitor' }
    });
  });
});

describe('reportCRMVisitorLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceEnv.CRM_API_URL = 'https://crm.example.com/api/v1/';
    mocks.serviceEnv.CRM_API_KEY = 'crm-key';
  });

  it('reports a lifecycle event and optional opportunity details', async () => {
    await expect(
      reportCRMVisitorLifecycle({
        visitorId: 'visitor/1',
        event: CRMLifecycleEvent.EnterpriseVerification,
        company: ' FastGPT ',
        summary: ' AI platform '
      })
    ).resolves.toBe(true);

    expect(mocks.post).toHaveBeenCalledWith(
      'https://crm.example.com/api/v1/contacts/visitor/visitor%2F1/lifecycle',
      {
        event: 'enterprise_verification',
        company: 'FastGPT',
        summary: 'AI platform'
      },
      {
        headers: { 'X-API-Key': 'crm-key' },
        timeout: 5000
      }
    );
  });

  it('returns false so a failed event is not marked as reported', async () => {
    mocks.post.mockRejectedValueOnce(new Error('CRM unavailable'));

    await expect(
      reportCRMVisitorLifecycle({
        visitorId: 'visitor-1',
        event: CRMLifecycleEvent.Consumption
      })
    ).resolves.toBe(false);
  });
});

describe('reportCRMEnterpriseVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceEnv.CRM_API_URL = 'https://crm.example.com/api/v1/';
    mocks.serviceEnv.CRM_API_KEY = 'crm-key';
  });

  it('reports without a visitor id using cloud user and submission ids', async () => {
    await expect(
      reportCRMEnterpriseVerification({
        cloudUserId: 'cloud-user-1',
        submissionId: 'enterprise-task-1',
        company: '认证企业',
        summary: '企业认证需求',
        name: '联系人',
        contact: '13800138000',
        position: 'CTO',
        consultationTopic: 'SaaS 版',
        details: {
          unified_credit_code: '91310000MA1K000006',
          legal_person_name: '法人',
          bank_name: '开户银行',
          bank_account: '4111111111111111'
        }
      })
    ).resolves.toBe(true);

    expect(mocks.post).toHaveBeenCalledWith(
      'https://crm.example.com/api/v1/contacts/opportunities/lifecycle',
      expect.objectContaining({
        event: 'enterprise_verification',
        cloud_user_id: 'cloud-user-1',
        submission_id: 'enterprise-task-1'
      }),
      expect.any(Object)
    );
  });
});

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
        contact: 'user@example.com'
      },
      {
        headers: { 'X-API-Key': 'crm-key' },
        timeout: 5000
      }
    );
  });

  it('reports a phone number when no email is available', async () => {
    mocks.serviceEnv.CRM_API_URL = 'https://crm.example.com/api/v1';
    mocks.serviceEnv.CRM_API_KEY = 'crm-key';

    await reportCRMVisitorIdentity({
      visitorId: 'visitor-1',
      userId: 'user-1',
      username: '13800138000'
    });

    expect(mocks.patch).toHaveBeenCalledWith(
      'https://crm.example.com/api/v1/contacts/visitor/visitor-1/identity',
      {
        cloud_user_id: 'user-1',
        contact: '13800138000'
      },
      expect.any(Object)
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
