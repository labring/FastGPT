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

export type ReportCRMEnterpriseVerificationProps = {
  visitorId?: string;
  cloudUserId: string;
  teamId: string;
  submissionId: string;
  company: string;
  summary: string;
  name: string;
  contact: string;
  position: string;
  consultationTopic: 'SaaS 版';
  details: {
    team_name?: string;
    unified_credit_code: string;
    legal_person_name: string;
    bank_name: string;
    bank_account: string;
    cumulative_recharge_amount?: number;
  };
};

export type ReportCRMEnterpriseRechargeAmountProps = {
  teamId: string;
  cumulativeRechargeAmount: number;
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

/** 企业认证可以早于官网 visitor 识别，使用 cloud_user_id 和 submission_id 幂等落库。 */
export const reportCRMEnterpriseVerification = async ({
  visitorId: rawVisitorId,
  cloudUserId: rawCloudUserId,
  teamId: rawTeamId,
  submissionId: rawSubmissionId,
  company,
  summary,
  name,
  contact,
  position,
  consultationTopic,
  details
}: ReportCRMEnterpriseVerificationProps): Promise<boolean> => {
  const { apiUrl, apiKey } = getCRMConfig();
  const visitorId = rawVisitorId?.trim();
  const cloudUserId = rawCloudUserId.trim();
  const teamId = rawTeamId.trim();
  const submissionId = rawSubmissionId.trim();

  if (!apiUrl || !apiKey || !cloudUserId || !teamId || !submissionId) return false;

  try {
    await axiosWithoutSSRF.post(
      `${apiUrl}/contacts/opportunities/lifecycle`,
      {
        event: CRMLifecycleEvent.EnterpriseVerification,
        ...(visitorId && { visitor_id: visitorId }),
        cloud_user_id: cloudUserId,
        team_id: teamId,
        submission_id: submissionId,
        company,
        summary,
        name,
        contact,
        position,
        consultation_topic: consultationTopic,
        details
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
    logger.warn('CRM enterprise verification report failed', {
      error,
      cloudUserId,
      submissionId,
      visitorId
    });
    return false;
  }
};

/** 上报企业认证线索的完整累计充值金额；CRM 端按 team_id 覆盖保存。 */
export const reportCRMEnterpriseRechargeAmount = async ({
  teamId: rawTeamId,
  cumulativeRechargeAmount
}: ReportCRMEnterpriseRechargeAmountProps): Promise<boolean> => {
  const { apiUrl, apiKey } = getCRMConfig();
  const teamId = rawTeamId.trim();

  if (
    !apiUrl ||
    !apiKey ||
    !teamId ||
    !Number.isFinite(cumulativeRechargeAmount) ||
    cumulativeRechargeAmount <= 0
  ) {
    return false;
  }

  try {
    await axiosWithoutSSRF.patch(
      `${apiUrl}/contacts/opportunities/enterprise-recharge`,
      {
        team_id: teamId,
        cumulative_recharge_amount: cumulativeRechargeAmount
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
    logger.warn('CRM enterprise recharge amount report failed', {
      error,
      teamId,
      cumulativeRechargeAmount
    });
    return false;
  }
};
