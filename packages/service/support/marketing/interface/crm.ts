import { successMarkerCache, type SuccessMarkerParams } from '@fastgpt/dal/redis/caches';
import { FastGPT_SEM_Schema } from '@fastgpt/global/support/marketing/type';
import { getLogger, LogCategories } from '../../../common/logger';
import { MongoUser } from '../../user/schema';
import { MongoTeamMember } from '../../user/team/teamMemberSchema';
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

const getMarkerParams = ({
  visitorId,
  event
}: {
  visitorId: string;
  event: CRMLifecycleEvent;
}): SuccessMarkerParams => ({
  scope: 'integration-report',
  segments: ['crm', 'lifecycle', event, visitorId]
});

const getVisitorId = (fastgptSem: unknown) => {
  const parsed = FastGPT_SEM_Schema.safeParse(fastgptSem);
  return parsed.success ? parsed.data.visitor_id : undefined;
};

/** CRM 生命周期公开接口：Redis 只减少重复请求，故障时 fail-open。 */
export const reportCRMVisitorLifecycleOnce = async ({
  visitorId,
  event,
  company,
  summary
}: LifecycleDetails & { visitorId?: string }): Promise<void> => {
  const normalizedVisitorId = visitorId?.trim();
  if (!isCRMReportingConfigured() || !normalizedVisitorId) return;

  const markerParams = getMarkerParams({ visitorId: normalizedVisitorId, event });
  try {
    if (await successMarkerCache.has(markerParams)) return;
  } catch (error) {
    logger.warn('CRM lifecycle success marker read failed; reporting anyway', {
      error,
      visitorId: normalizedVisitorId,
      event
    });
  }

  const success = await reportCRMVisitorLifecycle({
    visitorId: normalizedVisitorId,
    event,
    company,
    summary
  });
  if (!success) return;

  try {
    await successMarkerCache.mark({ params: markerParams });
  } catch (error) {
    logger.warn('CRM lifecycle success marker write failed', {
      error,
      visitorId: normalizedVisitorId,
      event
    });
  }
};

export const reportCRMUserLifecycleOnce = async ({
  userId,
  ...details
}: LifecycleDetails & { userId: string }): Promise<void> => {
  if (!isCRMReportingConfigured()) return;

  try {
    const user = await MongoUser.findById(userId, 'fastgpt_sem').lean();
    return reportCRMVisitorLifecycleOnce({
      visitorId: getVisitorId(user?.fastgpt_sem),
      ...details
    });
  } catch (error) {
    logger.warn('CRM user lifecycle resolution failed', { error, userId, event: details.event });
  }
};

export const reportCRMTeamMemberLifecycleOnce = async ({
  tmbId,
  ...details
}: LifecycleDetails & { tmbId: string }): Promise<void> => {
  if (!isCRMReportingConfigured()) return;

  try {
    const member = await MongoTeamMember.findById(tmbId, 'userId').lean();
    if (!member?.userId) return;

    return reportCRMUserLifecycleOnce({
      userId: String(member.userId),
      ...details
    });
  } catch (error) {
    logger.warn('CRM team member lifecycle resolution failed', {
      error,
      tmbId,
      event: details.event
    });
  }
};

export { CRMLifecycleEvent } from '../attribution';
