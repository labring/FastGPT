import { successMarkerCache, type SuccessMarkerParams } from '@fastgpt/dal/redis/caches';
import { FastGPT_SEM_Schema } from '@fastgpt/global/support/marketing/type';
import { getLogger, LogCategories } from '../../../common/logger';
import { MongoUser } from '../../user/schema';
import { MongoTeam } from '../../user/team/teamSchema';
import {
  isCRMReportingConfigured,
  reportCRMVisitorLifecycle,
  type CRMLifecycleEvent
} from '../attribution';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);

type LifecycleDetails = {
  event: CRMLifecycleEvent;
  company?: string;
  summary?: string;
};

const getTeamMarkerParams = ({
  teamId,
  event
}: {
  teamId: string;
  event: CRMLifecycleEvent;
}): SuccessMarkerParams => ({
  scope: 'integration-report',
  segments: ['crm', 'lifecycle', event, 'team', teamId]
});

const getVisitorId = (fastgptSem: unknown) => {
  const parsed = FastGPT_SEM_Schema.safeParse(fastgptSem);
  return parsed.success ? parsed.data.visitor_id : undefined;
};

/** CRM 生命周期公开接口：先按 team 去重，再解析其 owner 对应的 visitor_id。 */
export const reportCRMTeamLifecycleOnce = async ({
  teamId: rawTeamId,
  event,
  company,
  summary
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
    const team = await MongoTeam.findById(teamId, 'ownerId').lean();
    if (!team?.ownerId) return;

    const user = await MongoUser.findById(team.ownerId, 'fastgpt_sem').lean();
    const visitorId = getVisitorId(user?.fastgpt_sem);
    if (!visitorId) return;

    const success = await reportCRMVisitorLifecycle({
      visitorId,
      event,
      company,
      summary
    });
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
