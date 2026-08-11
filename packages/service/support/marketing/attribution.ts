import { axiosWithoutSSRF } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { serviceEnv } from '../../env';
import { FastGPT_SEM_Schema } from '@fastgpt/global/support/marketing/type';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);

type ReportCRMVisitorIdentityProps = {
  visitorId?: string;
  userId: string;
  username: string;
  contact?: string;
};

export const CRMLifecycleEvent = {
  Consumption: 'consumption',
  Recharge: 'recharge',
  EnterpriseVerification: 'enterprise_verification'
} as const;

export type CRMLifecycleEvent = (typeof CRMLifecycleEvent)[keyof typeof CRMLifecycleEvent];

export type ReportCRMVisitorLifecycleProps = {
  visitorId?: string;
  event: CRMLifecycleEvent;
  company?: string;
  summary?: string;
};

const getContact = (username: string, contact?: string) => {
  const candidates = [contact, username].map((value) => value?.trim()).filter(Boolean) as string[];
  const email = candidates.find((value) => value.includes('@'));
  if (email) return email;
  return candidates.find((value) => /^\+?[\d\s()-]{6,20}$/.test(value));
};

const getCRMConfig = () => ({
  apiUrl: serviceEnv.CRM_API_URL?.replace(/\/$/, ''),
  apiKey: serviceEnv.CRM_API_KEY
});

export const isCRMReportingConfigured = () => {
  const { apiUrl, apiKey } = getCRMConfig();
  return !!apiUrl && !!apiKey;
};

export const resolveCRMVisitorId = ({
  storedFastgptSem,
  incomingVisitorId
}: {
  storedFastgptSem?: unknown;
  incomingVisitorId?: string;
}) => {
  const parsedFastgptSem = FastGPT_SEM_Schema.safeParse(storedFastgptSem);
  const fastgptSem = parsedFastgptSem.success ? parsedFastgptSem.data : {};
  const storedVisitorId = fastgptSem.visitor_id?.trim();
  const normalizedIncomingVisitorId = incomingVisitorId?.trim();
  const shouldPersist = !storedVisitorId && !!normalizedIncomingVisitorId;

  return {
    visitorId: storedVisitorId || normalizedIncomingVisitorId,
    shouldPersist,
    fastgptSem: shouldPersist
      ? { ...fastgptSem, visitor_id: normalizedIncomingVisitorId }
      : fastgptSem
  };
};

/**
 * 将官网匿名 visitor_id 与 FastGPT 用户绑定。
 * 上报失败只记日志，不能影响注册或登录结果。
 */
export const reportCRMVisitorIdentity = async ({
  visitorId: rawVisitorId,
  userId,
  username,
  contact
}: ReportCRMVisitorIdentityProps): Promise<void> => {
  const { apiUrl: crmApiUrl, apiKey } = getCRMConfig();
  const visitorId = rawVisitorId?.trim();

  if (!crmApiUrl || !visitorId) return;
  if (!apiKey) {
    logger.warn('Skip CRM visitor identity report: CRM_API_KEY is not configured');
    return;
  }

  const normalizedContact = getContact(username, contact);

  try {
    await axiosWithoutSSRF.patch(
      `${crmApiUrl}/contacts/visitor/${encodeURIComponent(visitorId)}/identity`,
      {
        cloud_user_id: userId,
        ...(normalizedContact && { contact: normalizedContact })
      },
      {
        headers: {
          'X-API-Key': apiKey
        },
        timeout: 5000
      }
    );
  } catch (error) {
    logger.warn('CRM visitor identity report failed', {
      error,
      visitorId,
      userId
    });
  }
};

/** 上报单个 CRM 生命周期事件；返回值只表示本次 HTTP 上报是否成功。 */
export const reportCRMVisitorLifecycle = async ({
  visitorId: rawVisitorId,
  event,
  company,
  summary
}: ReportCRMVisitorLifecycleProps): Promise<boolean> => {
  const { apiUrl, apiKey } = getCRMConfig();
  const visitorId = rawVisitorId?.trim();

  if (!apiUrl || !apiKey || !visitorId) return false;

  try {
    await axiosWithoutSSRF.post(
      `${apiUrl}/contacts/visitor/${encodeURIComponent(visitorId)}/lifecycle`,
      {
        event,
        ...(company?.trim() && { company: company.trim() }),
        ...(summary?.trim() && { summary: summary.trim() })
      },
      {
        headers: {
          'X-API-Key': apiKey
        },
        timeout: 5000
      }
    );
    return true;
  } catch (error) {
    logger.warn('CRM visitor lifecycle report failed', {
      error,
      visitorId,
      event
    });
    return false;
  }
};
