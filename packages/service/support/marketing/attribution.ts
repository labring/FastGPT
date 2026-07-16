import type { FastGPTSourceType } from '@fastgpt/global/support/marketing/type';
import { axios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { serviceEnv } from '../../env';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);

type ReportCRMVisitorIdentityProps = {
  source?: FastGPTSourceType;
  userId: string;
  username: string;
  contact?: string;
};

const getEmail = (username: string, contact?: string) => {
  if (contact?.includes('@')) return contact;
  if (username.includes('@')) return username;
  return undefined;
};

/**
 * 将官网匿名 visitor_id 与 FastGPT 用户绑定。
 * 上报失败只记日志，不能影响注册或登录结果。
 */
export const reportCRMVisitorIdentity = async ({
  source,
  userId,
  username,
  contact
}: ReportCRMVisitorIdentityProps): Promise<void> => {
  const crmApiUrl = serviceEnv.CRM_API_URL?.replace(/\/$/, '');
  const visitorId = source?.visitor_id?.trim();

  if (!crmApiUrl || !visitorId) return;
  if (!serviceEnv.CRM_API_KEY) {
    logger.warn('Skip CRM visitor identity report: CRM_API_KEY is not configured');
    return;
  }

  const email = getEmail(username, contact);

  try {
    await axios.patch(
      `${crmApiUrl}/contacts/visitor/${encodeURIComponent(visitorId)}/identity`,
      {
        cloud_user_id: userId,
        cloud_username: username,
        cloud_user_email: email,
        name: username,
        email
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
