import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
import type {
  TeamStandardSubPlanItemType,
  TeamPlanStatusType,
  TeamPlanStandardType,
  TeamSubSchemaType
} from '@fastgpt/global/support/wallet/sub/type';
import dayjs from 'dayjs';
import { ReadPreference, type ClientSession } from '../../../common/mongo';
import { addMonths, addDays } from 'date-fns';
import { readFromSecondary } from '../../../common/mongo/utils';
import {
  setRedisCache,
  getRedisCache,
  delRedisCache,
  CacheKeyEnum,
  CacheKeyEnumTime,
  incrValueToCache
} from '../../../common/redis/cache';
import { getLogger, LogCategories } from '../../../common/logger';
import { serviceEnv } from '../../../env';

const logger = getLogger(LogCategories.MODULE.WALLET.SUB);

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

/**
 * 按套餐等级重新编排标准套餐的生效窗口。
 *
 * 最高等级套餐保留当前时间窗口，后续低等级套餐按原有时长依次接到上一档套餐之后。
 * 只重排未过期套餐，避免历史过期套餐把新发放权益排到过去。
 */
export const reComputeStandPlans = async (teamId: string, session: ClientSession) => {
  const plans = await MongoTeamSub.find({
    teamId,
    type: SubTypeEnum.standard,
    expiredTime: { $gt: new Date() }
  }).session(session);

  sortStandPlans(plans);

  for (let i = 1; i < plans.length; i++) {
    const plan = plans[i];
    const lastPlan = plans[i - 1];
    const duration = Math.abs(plan.expiredTime.getTime() - plan.startTime.getTime());
    plan.startTime = lastPlan.expiredTime;
    plan.expiredTime = new Date(plan.startTime.getTime() + duration);
  }

  for await (const plan of plans) {
    await plan.save({ session });
  }
};

const isActiveStandardSub = (sub: TeamSubSchemaType, now: Date) =>
  sub.type === SubTypeEnum.standard &&
  !dayjs(sub.startTime).isAfter(now) &&
  dayjs(sub.expiredTime).isAfter(now);

export const buildStandardPlan = (
  standard: TeamSubSchemaType,
  standardConstants: TeamStandardSubPlanItemType
): TeamPlanStandardType => ({
  ...standard,
  name: standardConstants.name,
  desc: standardConstants.desc,
  price: standardConstants.price,
  priceDescription: standardConstants.priceDescription,
  customFormUrl: standardConstants.customFormUrl,
  customDescriptions: standardConstants.customDescriptions,
  wecom: standardConstants.wecom,
  maxTeamMember: standard?.maxTeamMember ?? standardConstants.maxTeamMember,
  maxAppAmount: standard?.maxApp ?? standardConstants.maxAppAmount,
  maxDatasetAmount: standard?.maxDataset ?? standardConstants.maxDatasetAmount,
  requestsPerMinute: standard?.requestsPerMinute ?? standardConstants.requestsPerMinute,
  chatHistoryStoreDuration:
    standard?.chatHistoryStoreDuration ?? standardConstants.chatHistoryStoreDuration,
  maxDatasetSize: standard?.maxDatasetSize ?? standardConstants.maxDatasetSize,
  websiteSyncPerDataset: standard?.websiteSyncPerDataset ?? standardConstants.websiteSyncPerDataset,
  appRegistrationCount: standard?.appRegistrationCount ?? standardConstants.appRegistrationCount,
  auditLogStoreDuration: standard?.auditLogStoreDuration ?? standardConstants.auditLogStoreDuration,
  ticketResponseTime: standard?.ticketResponseTime ?? standardConstants.ticketResponseTime,
  customDomain: standard?.customDomain ?? standardConstants.customDomain,
  maxUploadFileSize: standard?.maxUploadFileSize ?? standardConstants.maxUploadFileSize,
  maxUploadFileCount: standard?.maxUploadFileCount ?? standardConstants.maxUploadFileCount,
  enableSandbox: standard?.enableSandbox ?? standardConstants.enableSandbox
});

export const initTeamFreePlan = async ({
  teamId,
  isWecomTeam = false,
  session
}: {
  teamId: string;
  isWecomTeam?: boolean;
  session?: ClientSession;
}) => {
  const freePoints = isWecomTeam
    ? Math.round((global.subPlans?.standard?.basic.totalPoints ?? 4000) / 2)
    : global?.subPlans?.standard?.[StandardSubLevelEnum.free]?.totalPoints || 100;

  const freePlan = await MongoTeamSub.findOne({
    teamId,
    type: SubTypeEnum.standard,
    currentSubLevel: StandardSubLevelEnum.free
  });

  // Get basic plan config for wecom mode
  const specialConfig: Record<string, any> | null = (() => {
    const config = global?.subPlans?.standard?.[StandardSubLevelEnum.basic];
    if (isWecomTeam && config) {
      return {
        maxTeamMember: config.maxTeamMember,
        maxApp: config.maxAppAmount,
        maxDataset: config.maxDatasetAmount,
        requestsPerMinute: config.requestsPerMinute,
        chatHistoryStoreDuration: config.chatHistoryStoreDuration,
        maxDatasetSize: config.maxDatasetSize,
        websiteSyncPerDataset: config.websiteSyncPerDataset,
        appRegistrationCount: config.appRegistrationCount,
        auditLogStoreDuration: config.auditLogStoreDuration,
        ticketResponseTime: config.ticketResponseTime,
        customDomain: config.customDomain
      } as TeamSubSchemaType;
    }
    return null;
  })();

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

    // Apply basic plan config for wecom, but with limited points and dataset size
    if (specialConfig) {
      for (const key in specialConfig) {
        (freePlan as any)[key] = specialConfig[key];
      }
    }

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
        expiredTime: isWecomTeam ? addDays(new Date(), 15) : addMonths(new Date(), 1),

        currentSubLevel: StandardSubLevelEnum.free,
        nextSubLevel: StandardSubLevelEnum.free,

        totalPoints: freePoints,
        surplusPoints: freePoints,
        ...(specialConfig && specialConfig)
      }
    ],
    { session, ordered: true }
  );
};

const normalizeInitTeamFreePlanResult = (
  plan: TeamSubSchemaType | TeamSubSchemaType[]
): TeamSubSchemaType => (Array.isArray(plan) ? plan[0] : plan);

const getStandardPlanConstants = (
  standard: Pick<TeamSubSchemaType, 'currentSubLevel'> | undefined,
  standardPlans: ReturnType<typeof getStandardPlansConfig>
) =>
  standard?.currentSubLevel && standardPlans
    ? standardPlans[
        standard.currentSubLevel === StandardSubLevelEnum.custom
          ? StandardSubLevelEnum.advanced
          : standard.currentSubLevel
      ]
    : undefined;

/**
 * 获取团队当前生效的标准套餐。
 *
 * 常规路径优先读 secondary 降低主库压力；如果 secondary 没有读到 active 套餐，
 * 再回 primary 做强一致复查，避免副本延迟把刚购买/发放的付费套餐误判为缺失，
 * 从而触发免费套餐初始化写入。
 */
export const getTeamStandPlan = async ({
  teamId
}: {
  teamId: string;
}): Promise<{
  [SubTypeEnum.standard]: TeamPlanStandardType | undefined;
}> => {
  const getActiveStandardPlan = (plans: TeamSubSchemaType[]) =>
    sortStandPlans(plans.filter((plan) => isActiveStandardSub(plan, new Date())))[0];

  const plans = await MongoTeamSub.find(
    {
      teamId,
      type: SubTypeEnum.standard
    },
    undefined,
    {
      ...readFromSecondary
    }
  ).lean();

  const standardPlans = global.subPlans?.standard;
  let standard = getActiveStandardPlan(plans);

  if (!standard) {
    const primaryPlans = await MongoTeamSub.find(
      {
        teamId,
        type: SubTypeEnum.standard
      },
      undefined,
      {
        readPreference: ReadPreference.PRIMARY,
        readConcern: {
          level: 'majority' as any
        }
      }
    ).lean();
    standard = getActiveStandardPlan(primaryPlans);
  }

  if (!standard) {
    logger.info('Initializing free standard plan for stand plan query', { teamId });
    standard = normalizeInitTeamFreePlanResult(await initTeamFreePlan({ teamId }));
  }

  const standardConstants = getStandardPlanConstants(standard, standardPlans);

  return {
    [SubTypeEnum.standard]: standardConstants
      ? buildStandardPlan(standard, standardConstants)
      : undefined
  };
};

// 获取团队所有套餐内容
export const getTeamPlanStatus = async ({
  teamId
}: {
  teamId: string;
}): Promise<TeamPlanStatusType> => {
  /** 配置里的套餐 */
  const standardPlans = global.subPlans?.standard;

  /* Get all plans and datasetSize */
  const plans = await MongoTeamSub.find({ teamId }).lean();

  /* Get all standardPlans and active standardPlan */
  const activeStandardPlans = sortStandPlans(
    plans.filter((plan) => isActiveStandardSub(plan, new Date()))
  );
  /** 数据库里的，用户目前 active 的套餐 */
  const standardPlan = activeStandardPlans[0];

  const extraDatasetSize = plans.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize);
  const extraPoints = plans.filter((plan) => plan.type === SubTypeEnum.extraPoints);

  // Free user, first login after expiration. The free subscription plan will be reset
  if (
    (standardPlan &&
      standardPlan.expiredTime &&
      standardPlan.currentSubLevel === StandardSubLevelEnum.free &&
      dayjs(standardPlan.expiredTime).isBefore(new Date())) ||
    activeStandardPlans.length === 0
  ) {
    logger.info('Initializing free standard plan', { teamId });
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
        standardPlans[
          standardPlan.currentSubLevel === StandardSubLevelEnum.custom
            ? StandardSubLevelEnum.advanced
            : standardPlan.currentSubLevel
        ]?.maxDatasetSize ||
        Infinity
      : Infinity;
  const totalDatasetSize =
    standardMaxDatasetSize +
    extraDatasetSize.reduce((acc, cur) => acc + (cur.currentExtraDatasetSize || 0), 0);

  /** 静态的套餐配置，如果是 custom 则返回 advanced */
  const standardConstants =
    standardPlan?.currentSubLevel && standardPlans
      ? standardPlans[
          standardPlan.currentSubLevel === StandardSubLevelEnum.custom
            ? StandardSubLevelEnum.advanced
            : standardPlan.currentSubLevel
        ]
      : undefined;

  teamPoint.updateTeamPointsCache({ teamId, totalPoints, surplusPoints });

  return {
    [SubTypeEnum.standard]: standardConstants
      ? buildStandardPlan(standardPlan, standardConstants)
      : undefined,

    totalPoints,
    usedPoints: totalPoints - surplusPoints,

    datasetMaxSize: totalDatasetSize
  };
};

/* ===== Buffer controller ===== */
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
  getTeamQPMLimit: async (teamId: string): Promise<number | undefined> => {
    // 1. 尝试从缓存中获取
    const cacheKey = `${CacheKeyEnum.team_qpm_limit}:${teamId}`;
    const cached = await getRedisCache(cacheKey);

    if (cached) {
      return Number(cached);
    }

    // 2. Computed
    const teamPlanStatus = await getTeamPlanStatus({ teamId });
    const limit = teamPlanStatus[SubTypeEnum.standard]?.requestsPerMinute;

    if (!limit) {
      return serviceEnv.CHAT_MAX_QPM;
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
