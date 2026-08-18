import { successMarkerCache, type SuccessMarkerParams } from '@fastgpt/dal/redis/caches';
import { FastGPT_SEM_Schema } from '@fastgpt/global/support/marketing/type';
import { getLogger, LogCategories } from '../../../common/logger';
import { MongoUser } from '../../user/schema';
import { MongoTeam } from '../../user/team/teamSchema';
import {
  isCRMReportingConfigured,
  reportCRMEnterpriseVerification,
  reportCRMVisitorLifecycle,
  type CRMLifecycleEvent
} from '../attribution';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);

type EnterpriseLifecycleDetails = {
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
  };
};

type LifecycleDetails = {
  event: CRMLifecycleEvent;
  company?: string;
  summary?: string;
  enterprise?: EnterpriseLifecycleDetails;
};

const getTeamMarkerParams = ({
  teamId,
  event
}: {
  teamId: string;
  event: CRMLifecycleEvent;
}): SuccessMarkerParams => ({
  scope: 'integration-report',
  segments: [
    'crm',
    'lifecycle',
    event,
    'team',
    teamId,
    ...(event === 'enterprise_verification' ? ['details-v2'] : [])
  ]
});

const getVisitorId = (fastgptSem: unknown) => {
  const parsed = FastGPT_SEM_Schema.safeParse(fastgptSem);
  return parsed.success ? parsed.data.visitor_id : undefined;
};

/**
 * CRM 生命周期公开接口：先按 team 去重，再使用其 owner 作为 cloud_user_id。
 * 普通生命周期事件仍要求 visitor_id；企业认证允许先无 visitor_id 落库，登录识别时再补关联。
 */
export const reportCRMTeamLifecycleOnce = async ({
  teamId: rawTeamId,
  event,
  company,
  summary,
  enterprise
}: LifecycleDetails & { teamId: string }): Promise<void> => {
  const teamId = rawTeamId.trim();
  if (!isCRMReportingConfigured() || !teamId) return;

  const markerParams = getTeamMarkerParams({ teamId, event });
  try {
    if (await successMarkerCache.has(markerParams)) return;
  } catch (error) {
    logger.warn('CRM team lifecycle success marker read failed; reporting anyway', {
      error,
      teamId,
      event
    });
  }

  try {
    const team = await MongoTeam.findById(teamId, 'ownerId name').lean();
    if (!team?.ownerId) return;

    const user = await MongoUser.findById(team.ownerId, 'fastgpt_sem').lean();
    const visitorId = getVisitorId(user?.fastgpt_sem);
    let success = false;
    if (event === 'enterprise_verification') {
      if (!enterprise) return;
      success = await reportCRMEnterpriseVerification({
        ...enterprise,
        cloudUserId: String(team.ownerId),
        visitorId,
        details: {
          ...enterprise.details,
          team_name: enterprise.details.team_name || team.name
        }
      });
    } else {
      if (!visitorId) return;
      success = await reportCRMVisitorLifecycle({
        visitorId,
        event,
        company,
        summary
      });
    }
    if (!success) return;

    try {
      await successMarkerCache.mark({ params: markerParams });
    } catch (error) {
      logger.warn('CRM team lifecycle success marker write failed', {
        error,
        teamId,
        event
      });
    }
  } catch (error) {
    logger.warn('CRM team lifecycle resolution failed', {
      error,
      teamId,
      event
    });
  }
};

export { CRMLifecycleEvent } from '../attribution';
