import { axios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { serviceEnv } from '../../env';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);

type ReportCRMVisitorIdentityProps = {
  visitorId?: string;
  userId: string;
  username: string;
  contact?: string;
};

const getContact = (username: string, contact?: string) => {
  const candidates = [contact, username].map((value) => value?.trim()).filter(Boolean) as string[];
  const email = candidates.find((value) => value.includes('@'));
  if (email) return email;
  return candidates.find((value) => /^\+?[\d\s()-]{6,20}$/.test(value));
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
  const crmApiUrl = serviceEnv.CRM_API_URL?.replace(/\/$/, '');
  const visitorId = rawVisitorId?.trim();

  if (!crmApiUrl || !visitorId) return;
  if (!serviceEnv.CRM_API_KEY) {
    logger.warn('Skip CRM visitor identity report: CRM_API_KEY is not configured');
    return;
  }

  const normalizedContact = getContact(username, contact);

  try {
    await axios.patch(
      `${crmApiUrl}/contacts/visitor/${encodeURIComponent(visitorId)}/identity`,
      {
        cloud_user_id: userId,
        ...(normalizedContact && { contact: normalizedContact })
      },
      {
        headers: {
          'X-API-Key': serviceEnv.CRM_API_KEY
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
