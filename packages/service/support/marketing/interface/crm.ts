import { successMarkerCache, type SuccessMarkerParams } from '@fastgpt/dal/redis/caches';
import { FastGPT_SEM_Schema } from '@fastgpt/global/support/marketing/type';
import { getLogger, LogCategories } from '../../../common/logger';
import { teamRepository, userRepository } from '../../../common/dal';
import {
  isCRMReportingConfigured,
  reportCRMEnterpriseRechargeAmount,
  reportCRMEnterpriseVerification,
  reportCRMVisitorLifecycle
} from '../attribution';

const logger = getLogger(LogCategories.MODULE.USER.ACCOUNT);

export type CRMEnterpriseVerificationDetails = {
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

type LifecycleDetails = {
  teamId: string;
  event: 'consumption' | 'recharge';
};

const getTeamMarkerParams = ({
  teamId,
  markerKey
}: {
  teamId: string;
  markerKey: string;
}): SuccessMarkerParams => ({
  scope: 'integration-report',
  segments: ['crm', 'lifecycle', markerKey, 'team', teamId]
});

const getVisitorId = (fastgptSem: unknown) => {
  const parsed = FastGPT_SEM_Schema.safeParse(fastgptSem);
  return parsed.success ? parsed.data.visitor_id : undefined;
};

type TeamOwnerReportContext = {
  cloudUserId: string;
  visitorId?: string;
  teamName?: string;
};

const reportCRMTeamEventOnce = async ({
  teamId: rawTeamId,
  markerKey,
  report
}: {
  teamId: string;
  markerKey: string;
  report: (context: TeamOwnerReportContext) => Promise<boolean>;
}): Promise<void> => {
  const teamId = rawTeamId.trim();
  if (!isCRMReportingConfigured() || !teamId) return;

  const markerParams = getTeamMarkerParams({ teamId, markerKey });
  try {
    if (await successMarkerCache.has(markerParams)) return;
  } catch (error) {
    logger.warn('CRM team lifecycle success marker read failed; reporting anyway', {
      error,
      teamId,
      markerKey
    });
  }

  try {
    const team = await teamRepository.findTeamById(teamId);
    if (!team?.ownerId) return;

    const user = await userRepository.findSemById(String(team.ownerId));
    const visitorId = getVisitorId(user?.fastgpt_sem);
    const success = await report({
      cloudUserId: String(team.ownerId),
      visitorId,
      teamName: team.name
    });
    if (!success) return;

    try {
      await successMarkerCache.mark({ params: markerParams });
    } catch (error) {
      logger.warn('CRM team lifecycle success marker write failed', {
        error,
        teamId,
        markerKey
      });
    }
  } catch (error) {
    logger.warn('CRM team lifecycle resolution failed', {
      error,
      teamId,
      markerKey
    });
  }
};

const reportCRMTeamVisitorLifecycleOnce = async ({
  teamId,
  event
}: LifecycleDetails): Promise<void> =>
  reportCRMTeamEventOnce({
    teamId,
    markerKey: event,
    report: async ({ visitorId }) => {
      if (!visitorId) return false;
      return reportCRMVisitorLifecycle({
        visitorId,
        event
      });
    }
  });

export const reportCRMTeamConsumptionOnce = ({ teamId }: { teamId: string }) =>
  reportCRMTeamVisitorLifecycleOnce({
    teamId,
    event: 'consumption'
  });

export const reportCRMTeamRechargeOnce = ({ teamId }: { teamId: string }) =>
  reportCRMTeamVisitorLifecycleOnce({
    teamId,
    event: 'recharge'
  });

/** 上报认证企业的完整累计充值金额，不使用生命周期成功标记。 */
export const reportCRMTeamEnterpriseRechargeAmount = ({
  teamId,
  cumulativeRechargeAmount
}: {
  teamId: string;
  cumulativeRechargeAmount: number;
}) =>
  reportCRMEnterpriseRechargeAmount({
    teamId,
    cumulativeRechargeAmount
  });

export const reportCRMTeamEnterpriseVerificationOnce = ({
  teamId,
  enterprise
}: {
  teamId: string;
  enterprise: CRMEnterpriseVerificationDetails;
}) =>
  reportCRMTeamEventOnce({
    teamId,
    markerKey: 'enterprise_verification_details-v2',
    report: ({ cloudUserId, visitorId, teamName }) =>
      reportCRMEnterpriseVerification({
        ...enterprise,
        cloudUserId,
        teamId,
        visitorId,
        details: {
          ...enterprise.details,
          team_name: enterprise.details.team_name || teamName
        }
      })
  });

export { CRMLifecycleEvent } from '../attribution';
