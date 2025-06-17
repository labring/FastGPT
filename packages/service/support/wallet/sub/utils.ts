import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
import {
  type TeamPlanStatusType,
  type TeamSubSchema
} from '@fastgpt/global/support/wallet/sub/type.d';
import dayjs from 'dayjs';
import { type ClientSession } from '../../../common/mongo';
import { addMonths } from 'date-fns';
import { readFromSecondary } from '../../../common/mongo/utils';
import {
  setRedisCache,
  getRedisCache,
  delRedisCache,
  CacheKeyEnum,
  CacheKeyEnumTime
} from '../../../common/redis/cache';

export const getStandardPlansConfig = () => {
  return global?.subPlans?.standard;
};
export const getStandardPlanConfig = (level: `${StandardSubLevelEnum}`) => {
  return global.subPlans?.standard?.[level];
};

export const sortStandPlans = (plans: TeamSubSchema[]) => {
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
          maxTeamMember: standard?.maxTeamMember || standardConstants.maxTeamMember,
          maxAppAmount: standard?.maxApp || standardConstants.maxAppAmount,
          maxDatasetAmount: standard?.maxDataset || standardConstants.maxDatasetAmount
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

  const getPointsFromCacheOrDB = async () => {
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

    const pointsAggregation = await MongoTeamSub.aggregate([
      {
        $match: { teamId }
      },
      {
        $group: {
          _id: null,
          totalPoints: {
            $sum: {
              $cond: [
                { $in: ['$type', [SubTypeEnum.standard, SubTypeEnum.extraPoints]] },
                { $ifNull: ['$totalPoints', 0] },
                0
              ]
            }
          },
          surplusPoints: {
            $sum: {
              $cond: [
                { $in: ['$type', [SubTypeEnum.standard, SubTypeEnum.extraPoints]] },
                { $ifNull: ['$surplusPoints', 0] },
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          totalPoints: {
            $cond: [{ $eq: [{ $type: '$totalPoints' }, 'missing'] }, Infinity, '$totalPoints']
          },
          surplusPoints: '$surplusPoints'
        }
      }
    ]);

    const result = pointsAggregation[0] || { totalPoints: 0, surplusPoints: 0 };

    // 处理无订阅计划的情况
    if (!standardPlans) {
      return { totalPoints: Infinity, surplusPoints: 0, usedPoints: 0 };
    }
    return {
      ...result,
      usedPoints: result.totalPoints - result.surplusPoints
    };
  };

  /* Get all plans and datasetSize */
  const plans = await MongoTeamSub.find({ teamId }).lean();

  /* Get all standardPlans and active standardPlan */
  const teamStandardPlans = sortStandPlans(
    plans.filter((plan) => plan.type === SubTypeEnum.standard)
  );
  const standardPlan = teamStandardPlans[0];

  const extraDatasetSize = plans.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize);

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

  const { totalPoints, surplusPoints, usedPoints } = await getPointsFromCacheOrDB();

  const standardMaxDatasetSize =
    standardPlan?.currentSubLevel && standardPlans
      ? standardPlans[standardPlan.currentSubLevel]?.maxDatasetSize || Infinity
      : Infinity;
  const totalDatasetSize =
    standardMaxDatasetSize +
    extraDatasetSize.reduce((acc, cur) => acc + (cur.currentExtraDatasetSize || 0), 0);

  const standardConstants =
    standardPlan?.currentSubLevel && standardPlans
      ? standardPlans[standardPlan.currentSubLevel]
      : undefined;

  const result = {
    [SubTypeEnum.standard]: standardPlan,
    standardConstants: standardConstants
      ? {
          ...standardConstants,
          maxTeamMember: standardPlan?.maxTeamMember || standardConstants.maxTeamMember,
          maxAppAmount: standardPlan?.maxApp || standardConstants.maxAppAmount,
          maxDatasetAmount: standardPlan?.maxDataset || standardConstants.maxDatasetAmount
        }
      : undefined,

    totalPoints,
    usedPoints,

    datasetMaxSize: totalDatasetSize
  };

  (async () => {
    const surplusCacheKey = `${CacheKeyEnum.team_point_surplus}:${teamId}`;
    const totalCacheKey = `${CacheKeyEnum.team_point_total}:${teamId}`;

    await Promise.all([
      setRedisCache(surplusCacheKey, surplusPoints, CacheKeyEnumTime.team_point_surplus),
      setRedisCache(totalCacheKey, totalPoints, CacheKeyEnumTime.team_point_total)
    ]);
  })();

  return result;
};

export const clearTeamPointsCache = async (teamId: string) => {
  const surplusCacheKey = `${CacheKeyEnum.team_point_surplus}:${teamId}`;
  const totalCacheKey = `${CacheKeyEnum.team_point_total}:${teamId}`;

  await Promise.all([delRedisCache(surplusCacheKey), delRedisCache(totalCacheKey)]);
};

export const updateTeamPointsCache = async (
  teamId: string,
  totalPoints: number,
  surplusPoints: number
) => {
  const surplusCacheKey = `${CacheKeyEnum.team_point_surplus}:${teamId}`;
  const totalCacheKey = `${CacheKeyEnum.team_point_total}:${teamId}`;

  await Promise.all([
    setRedisCache(surplusCacheKey, surplusPoints, CacheKeyEnumTime.team_point_surplus),
    setRedisCache(totalCacheKey, totalPoints, CacheKeyEnumTime.team_point_total)
  ]);
};
