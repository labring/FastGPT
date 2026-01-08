import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
import {
  type TeamPlanStatusType,
  type TeamSubSchemaType
} from '@fastgpt/global/support/wallet/sub/type';
import dayjs from 'dayjs';
import { type ClientSession } from '../../../common/mongo';
import { addMonths } from 'date-fns';
import { readFromSecondary } from '../../../common/mongo/utils';
import {
  setRedisCache,
  getRedisCache,
  delRedisCache,
  CacheKeyEnum,
  CacheKeyEnumTime,
  incrValueToCache
} from '../../../common/redis/cache';

export const getStandardPlansConfig = () => {
  return global?.subPlans?.standard;
};
export const getStandardPlanConfig = (level: `${StandardSubLevelEnum}`) => {
  return global.subPlans?.standard?.[level];
};

export const sortStandPlans = (plans: TeamSubSchemaType[]) => {
  return plans.sort(
    (a, b) =>
      standardSubLevelMap[b.currentSubLevel].weight - standardSubLevelMap[a.currentSubLevel].weight
  );
};
export const getTeamStandPlan = async ({ teamId }: { teamId: string }) => {
  const plans = await MongoTeamSub.find(
    {
      teamId,
      type: SubTypeEnum.standard
    },
    undefined,
    {
      ...readFromSecondary
    }
  );
  sortStandPlans(plans);

  const standardPlans = global.subPlans?.standard;
  const standard = plans[0];

  const standardConstants =
    standard?.currentSubLevel && standardPlans
      ? standardPlans[standard.currentSubLevel]
      : undefined;

  return {
    [SubTypeEnum.standard]: standard,
    standardConstants: standardConstants
      ? {
          ...standardConstants,
          maxTeamMember: standard?.maxTeamMember ?? standardConstants.maxTeamMember,
          maxAppAmount: standard?.maxApp ?? standardConstants.maxAppAmount,
          maxDatasetAmount: standard?.maxDataset ?? standardConstants.maxDatasetAmount,
          requestsPerMinute: standard?.requestsPerMinute ?? standardConstants.requestsPerMinute,
          chatHistoryStoreDuration:
            standard?.chatHistoryStoreDuration ?? standardConstants.chatHistoryStoreDuration,
          maxDatasetSize: standard?.maxDatasetSize ?? standardConstants.maxDatasetSize,
          websiteSyncPerDataset:
            standard?.websiteSyncPerDataset ?? standardConstants.websiteSyncPerDataset,
          appRegistrationCount:
            standard?.appRegistrationCount ?? standardConstants.appRegistrationCount,
          auditLogStoreDuration:
            standard?.auditLogStoreDuration ?? standardConstants.auditLogStoreDuration,
          ticketResponseTime: standard?.ticketResponseTime ?? standardConstants.ticketResponseTime,
          customDomain: standard?.customDomain ?? standardConstants.customDomain
        }
      : undefined
  };
};

export const initTeamFreePlan = async ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) => {
  const freePoints = global?.subPlans?.standard?.[StandardSubLevelEnum.free]?.totalPoints || 100;

  const freePlan = await MongoTeamSub.findOne({
    teamId,
    type: SubTypeEnum.standard,
    currentSubLevel: StandardSubLevelEnum.free
  });

  // Reset one month free plan
  if (freePlan) {
    freePlan.currentMode = SubModeEnum.month;
    freePlan.nextMode = SubModeEnum.month;
    freePlan.startTime = new Date();
    freePlan.expiredTime = addMonths(new Date(), 1);

    freePlan.currentSubLevel = StandardSubLevelEnum.free;
    freePlan.nextSubLevel = StandardSubLevelEnum.free;

    freePlan.totalPoints = freePoints;
    freePlan.surplusPoints =
      freePlan.surplusPoints && freePlan.surplusPoints < 0
        ? freePlan.surplusPoints + freePoints
        : freePoints;
    return freePlan.save({ session });
  }

  return MongoTeamSub.create(
    [
      {
        teamId,
        type: SubTypeEnum.standard,
        currentMode: SubModeEnum.month,
        nextMode: SubModeEnum.month,
        startTime: new Date(),
        expiredTime: addMonths(new Date(), 1),

        currentSubLevel: StandardSubLevelEnum.free,
        nextSubLevel: StandardSubLevelEnum.free,

        totalPoints: freePoints,
        surplusPoints: freePoints
      }
    ],
    { session, ordered: true }
  );
};

export const getTeamPlanStatus = async ({
  teamId
}: {
  teamId: string;
}): Promise<TeamPlanStatusType> => {
  const standardPlans = global.subPlans?.standard;

  /* Get all plans and datasetSize */
  const plans = await MongoTeamSub.find({ teamId }).lean();

  /* Get all standardPlans and active standardPlan */
  const teamStandardPlans = sortStandPlans(
    plans.filter((plan) => plan.type === SubTypeEnum.standard)
  );
  const standardPlan = teamStandardPlans[0];

  const extraDatasetSize = plans.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize);
  const extraPoints = plans.filter((plan) => plan.type === SubTypeEnum.extraPoints);

  // Free user, first login after expiration. The free subscription plan will be reset
  if (
    (standardPlan &&
      standardPlan.expiredTime &&
      standardPlan.currentSubLevel === StandardSubLevelEnum.free &&
      dayjs(standardPlan.expiredTime).isBefore(new Date())) ||
    teamStandardPlans.length === 0
  ) {
    console.log('Init free stand plan', { teamId });
    await initTeamFreePlan({ teamId });
    return getTeamPlanStatus({ teamId });
  }

  const totalPoints = standardPlans
    ? (standardPlan?.totalPoints || 0) +
      extraPoints.reduce((acc, cur) => acc + (cur.totalPoints || 0), 0)
    : Infinity;
  const surplusPoints =
    (standardPlan?.surplusPoints || 0) +
    extraPoints.reduce((acc, cur) => acc + (cur.surplusPoints || 0), 0);

  const standardMaxDatasetSize =
    standardPlan?.currentSubLevel && standardPlans
      ? standardPlan?.maxDatasetSize ||
        standardPlans[standardPlan.currentSubLevel]?.maxDatasetSize ||
        Infinity
      : Infinity;
  const totalDatasetSize =
    standardMaxDatasetSize +
    extraDatasetSize.reduce((acc, cur) => acc + (cur.currentExtraDatasetSize || 0), 0);

  const standardConstants =
    standardPlan?.currentSubLevel && standardPlans
      ? standardPlans[standardPlan.currentSubLevel]
      : undefined;

  teamPoint.updateTeamPointsCache({ teamId, totalPoints, surplusPoints });

  return {
    [SubTypeEnum.standard]: standardPlan,
    standardConstants: standardConstants
      ? {
          ...standardConstants,
          maxTeamMember: standardPlan?.maxTeamMember ?? standardConstants.maxTeamMember,
          maxAppAmount: standardPlan?.maxApp ?? standardConstants.maxAppAmount,
          maxDatasetAmount: standardPlan?.maxDataset ?? standardConstants.maxDatasetAmount,
          requestsPerMinute: standardPlan?.requestsPerMinute ?? standardConstants.requestsPerMinute,
          chatHistoryStoreDuration:
            standardPlan?.chatHistoryStoreDuration ?? standardConstants.chatHistoryStoreDuration,
          maxDatasetSize: standardPlan?.maxDatasetSize ?? standardConstants.maxDatasetSize,
          websiteSyncPerDataset:
            standardPlan?.websiteSyncPerDataset || standardConstants.websiteSyncPerDataset,
          appRegistrationCount:
            standardPlan?.appRegistrationCount ?? standardConstants.appRegistrationCount,
          auditLogStoreDuration:
            standardPlan?.auditLogStoreDuration ?? standardConstants.auditLogStoreDuration,
          ticketResponseTime:
            standardPlan?.ticketResponseTime ?? standardConstants.ticketResponseTime,
          customDomain: standardPlan?.customDomain ?? standardConstants.customDomain
        }
      : undefined,

    totalPoints,
    usedPoints: totalPoints - surplusPoints,

    datasetMaxSize: totalDatasetSize
  };
};

export const teamPoint = {
  getTeamPoints: async ({ teamId }: { teamId: string }) => {
    const surplusCacheKey = `${CacheKeyEnum.team_point_surplus}:${teamId}`;
    const totalCacheKey = `${CacheKeyEnum.team_point_total}:${teamId}`;

    const [surplusCacheStr, totalCacheStr] = await Promise.all([
      getRedisCache(surplusCacheKey),
      getRedisCache(totalCacheKey)
    ]);

    if (surplusCacheStr && totalCacheStr) {
      const totalPoints = Number(totalCacheStr);
      const surplusPoints = Number(surplusCacheStr);
      return {
        totalPoints,
        surplusPoints,
        usedPoints: totalPoints - surplusPoints
      };
    }

    const planStatus = await getTeamPlanStatus({ teamId });
    return {
      totalPoints: planStatus.totalPoints,
      surplusPoints: planStatus.totalPoints - planStatus.usedPoints,
      usedPoints: planStatus.usedPoints
    };
  },
  incrTeamPointsCache: async ({ teamId, value }: { teamId: string; value: number }) => {
    const surplusCacheKey = `${CacheKeyEnum.team_point_surplus}:${teamId}`;
    await incrValueToCache(surplusCacheKey, value);
  },
  updateTeamPointsCache: async ({
    teamId,
    totalPoints,
    surplusPoints
  }: {
    teamId: string;
    totalPoints: number;
    surplusPoints: number;
  }) => {
    const surplusCacheKey = `${CacheKeyEnum.team_point_surplus}:${teamId}`;
    const totalCacheKey = `${CacheKeyEnum.team_point_total}:${teamId}`;

    await Promise.all([
      setRedisCache(surplusCacheKey, surplusPoints, CacheKeyEnumTime.team_point_surplus),
      setRedisCache(totalCacheKey, totalPoints, CacheKeyEnumTime.team_point_total)
    ]);
  },
  clearTeamPointsCache: async (teamId: string) => {
    const surplusCacheKey = `${CacheKeyEnum.team_point_surplus}:${teamId}`;
    const totalCacheKey = `${CacheKeyEnum.team_point_total}:${teamId}`;

    await Promise.all([delRedisCache(surplusCacheKey), delRedisCache(totalCacheKey)]);
  }
};
export const teamQPM = {
  getTeamQPMLimit: async (teamId: string): Promise<number | null> => {
    // 1. 尝试从缓存中获取
    const cacheKey = `${CacheKeyEnum.team_qpm_limit}:${teamId}`;
    const cached = await getRedisCache(cacheKey);

    if (cached) {
      return Number(cached);
    }

    // 2. Computed
    const teamPlanStatus = await getTeamPlanStatus({ teamId });
    const limit =
      teamPlanStatus[SubTypeEnum.standard]?.requestsPerMinute ??
      teamPlanStatus.standardConstants?.requestsPerMinute;

    if (!limit) {
      if (process.env.CHAT_MAX_QPM) return Number(process.env.CHAT_MAX_QPM);
      return null;
    }

    // 3. Set cache
    await teamQPM.setCachedTeamQPMLimit(teamId, limit);

    return limit;
  },
  setCachedTeamQPMLimit: async (teamId: string, limit: number): Promise<void> => {
    const cacheKey = `${CacheKeyEnum.team_qpm_limit}:${teamId}`;
    await setRedisCache(cacheKey, limit.toString(), CacheKeyEnumTime.team_qpm_limit);
  },
  clearTeamQPMLimitCache: async (teamId: string): Promise<void> => {
    const cacheKey = `${CacheKeyEnum.team_qpm_limit}:${teamId}`;
    await delRedisCache(cacheKey);
  }
};

// controler
export const clearTeamPlanCache = async (teamId: string) => {
  await teamPoint.clearTeamPointsCache(teamId);
  await teamQPM.clearTeamQPMLimitCache(teamId);
};
