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
import { type ClientSession } from '../../../common/mongo';
import { addMonths, addDays } from 'date-fns';
import { readFromSecondary } from '../../../common/mongo/utils';
import { TeamPointCache, teamQpmCache } from '@fastgpt/dal/redis/caches';
import { getLogger, LogCategories } from '../../../common/logger';
import { serviceEnv } from '../../../env';
import { getRuntimeStandardPlanConfig } from '@fastgpt/global/support/wallet/sub/utils';

const logger = getLogger(LogCategories.MODULE.WALLET.SUB);
const teamPointCache = new TeamPointCache({ logger });

/** 将非有限套餐数值归一化为 null，统一表示无限或不限制。 */
const normalizeUnlimitedValue = (value: number): number | null =>
  Number.isFinite(value) ? value : null;

export const getStandardPlansConfig = () => {
  return global?.subPlans?.standard;
};
export const getStandardPlanConfig = (level: `${StandardSubLevelEnum}`) => {
  return getRuntimeStandardPlanConfig({
    plans: global.subPlans?.standard,
    level
  });
};

export const sortStandPlans = (plans: TeamSubSchemaType[]) => {
  return plans.sort(
    (a, b) =>
      standardSubLevelMap[b.currentSubLevel].weight - standardSubLevelMap[a.currentSubLevel].weight
  );
};

/**
 * 将标准套餐的历史数据库记录与当前静态配置合并为完整的客户端格式。
 * 缺失的续订字段仅在读取结果中按当前套餐补齐，不回写原始订阅记录。
 */
export const buildStandardPlan = (
  standard: TeamSubSchemaType,
  standardConstants: TeamStandardSubPlanItemType
): TeamPlanStandardType => ({
  ...standard,
  currentMode: standard.currentMode ?? SubModeEnum.month,
  nextMode: standard.nextMode ?? standard.currentMode ?? SubModeEnum.month,
  nextSubLevel: standard.nextSubLevel ?? standard.currentSubLevel,
  totalPoints: normalizeUnlimitedValue(standard.totalPoints),
  surplusPoints: normalizeUnlimitedValue(standard.surplusPoints),
  currentExtraDatasetSize: standard.currentExtraDatasetSize ?? 0,
  name: standardConstants.name,
  desc: standardConstants.desc,
  price: standardConstants.price,
  priceDescription: standardConstants.priceDescription,
  customFormUrl: standardConstants.customFormUrl,
  customDescriptions: standardConstants.customDescriptions,
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

// 获取团队标准套餐
export const getTeamStandPlan = async ({ teamId }: { teamId: string }) => {
  const standardPlans = global.subPlans?.standard;
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
  sortStandPlans(plans);

  const standard = plans[0];

  const standardConstants = standard?.currentSubLevel
    ? getStandardPlanConfig(standard.currentSubLevel)
    : undefined;

  return {
    [SubTypeEnum.standard]:
      standard && standardConstants ? buildStandardPlan(standard, standardConstants) : undefined
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
  const teamStandardPlans = sortStandPlans(
    plans.filter((plan) => plan.type === SubTypeEnum.standard)
  );
  /** 数据库里的，用户目前 active 的套餐 */
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
    logger.info('Initializing free standard plan', { teamId });
    await initTeamFreePlan({ teamId });
    return getTeamPlanStatus({ teamId });
  }

  const totalPoints = standardPlans
    ? normalizeUnlimitedValue(
        (standardPlan?.totalPoints || 0) +
          extraPoints.reduce((acc, cur) => acc + (cur.totalPoints || 0), 0)
      )
    : null;
  const surplusPoints = standardPlans
    ? normalizeUnlimitedValue(
        (standardPlan?.surplusPoints || 0) +
          extraPoints.reduce((acc, cur) => acc + (cur.surplusPoints || 0), 0)
      )
    : null;

  const configuredStandardMaxDatasetSize =
    standardPlan?.currentSubLevel && standardPlans
      ? (standardPlan?.maxDatasetSize ??
        getStandardPlanConfig(standardPlan.currentSubLevel)?.maxDatasetSize)
      : undefined;
  const standardMaxDatasetSize =
    configuredStandardMaxDatasetSize === undefined
      ? null
      : normalizeUnlimitedValue(configuredStandardMaxDatasetSize);
  const totalDatasetSize =
    standardMaxDatasetSize === null
      ? null
      : normalizeUnlimitedValue(
          standardMaxDatasetSize +
            extraDatasetSize.reduce((acc, cur) => acc + (cur.currentExtraDatasetSize || 0), 0)
        );

  const standardConstants = standardPlan?.currentSubLevel
    ? getStandardPlanConfig(standardPlan.currentSubLevel)
    : undefined;

  // Redis 只承担积分读取加速，刷新失败或变慢都不应阻塞套餐主流程。
  if (totalPoints === null || surplusPoints === null) {
    void teamPointCache.clear(teamId);
  } else {
    void teamPointCache.set({ teamId, totalPoints, surplusPoints });
  }

  return {
    [SubTypeEnum.standard]: standardConstants
      ? buildStandardPlan(standardPlan, standardConstants)
      : undefined,

    totalPoints,
    usedPoints: totalPoints === null || surplusPoints === null ? null : totalPoints - surplusPoints,

    datasetMaxSize: totalDatasetSize
  };
};

/* ===== Buffer controller ===== */
export const teamPoint = {
  getTeamPoints: async ({ teamId }: { teamId: string }) => {
    const cached = await teamPointCache.get(teamId);

    if (cached) {
      const { totalPoints, surplusPoints } = cached;
      return {
        totalPoints,
        surplusPoints,
        usedPoints: totalPoints - surplusPoints
      };
    }

    const planStatus = await getTeamPlanStatus({ teamId });
    return {
      totalPoints: planStatus.totalPoints,
      surplusPoints:
        planStatus.totalPoints === null || planStatus.usedPoints === null
          ? null
          : planStatus.totalPoints - planStatus.usedPoints,
      usedPoints: planStatus.usedPoints
    };
  },
  incrTeamPointsCache: async ({ teamId, value }: { teamId: string; value: number }) => {
    await teamPointCache.incrementSurplus({ teamId, value });
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
    await teamPointCache.set({ teamId, totalPoints, surplusPoints });
  },
  clearTeamPointsCache: async (teamId: string) => {
    await teamPointCache.clear(teamId);
  }
};
export const teamQPM = {
  getTeamQPMLimit: async (teamId: string): Promise<number | undefined> => {
    // 1. 尝试从缓存中获取
    const cached = await teamQpmCache.getCachedLimit(teamId);

    if (cached !== null) {
      return cached;
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
    await teamQpmCache.setCachedLimit({ teamId, limit });
  },
  clearTeamQPMLimitCache: async (teamId: string): Promise<void> => {
    await teamQpmCache.clearCachedLimit(teamId);
  }
};

// controler
export const clearTeamPlanCache = async (teamId: string) => {
  await teamPoint.clearTeamPointsCache(teamId);
  await teamQPM.clearTeamQPMLimitCache(teamId);
};
