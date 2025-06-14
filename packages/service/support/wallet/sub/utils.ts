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
import { throttle } from 'lodash';

export const getTeamPlanStatus = async ({
  teamId
}: {
  teamId: string;
}): Promise<TeamPlanStatusType> => {
  const plans: TeamSubSchema[] = await MongoTeamSub.find({ teamId }).lean();
  const standardPlan = pickHighestStandardPlan(
    plans.filter((plan) => plan.type === SubTypeEnum.standard)
  );
  // Free user, first login after expiration. The free subscription plan will be reset
  if (
    (standardPlan &&
      standardPlan.expiredTime &&
      standardPlan.currentSubLevel === StandardSubLevelEnum.free &&
      dayjs(standardPlan.expiredTime).isBefore(new Date())) ||
    !standardPlan
  ) {
    console.log('Init free stand plan', { teamId });
    await initTeamFreePlan({ teamId });
    return getTeamPlanStatus({ teamId });
  }
  const { totalPoints, surplusPoints, usedPoints } = await getTeamPointsByTeamId(teamId, plans);
  const datasetMaxSize = await getTeamDatasetMaxSizeByTeamId(teamId, plans);
  const constants = await getTeamStandardConstantsByTeamId(teamId, plans);
  return {
    [SubTypeEnum.standard]: standardPlan,
    standardConstants: constants,
    totalPoints,
    usedPoints,
    datasetMaxSize
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

export async function getTeamPointsByTeamId(teamId: string, plans?: TeamSubSchema[]) {
  const standardPlans = global.subPlans?.standard;
  let usePlans = plans;
  if (!usePlans) {
    usePlans = await MongoTeamSub.find({ teamId }).lean();
  }
  const teamStandardPlans = sortStandPlans(
    (usePlans || []).filter((plan) => plan.type === SubTypeEnum.standard)
  );
  const standardPlan = teamStandardPlans[0];
  const extraPoints = (usePlans || []).filter((plan) => plan.type === SubTypeEnum.extraPoints);
  const totalPoints = standardPlans
    ? (standardPlan?.totalPoints || 0) +
      extraPoints.reduce((acc, cur) => acc + (cur.totalPoints || 0), 0)
    : Infinity;
  const surplusPoints =
    (standardPlan?.surplusPoints || 0) +
    extraPoints.reduce((acc, cur) => acc + (cur.surplusPoints || 0), 0);
  return {
    totalPoints,
    surplusPoints,
    usedPoints: totalPoints - surplusPoints
  };
}

export async function getTeamDatasetMaxSizeByTeamId(teamId: string, plans?: TeamSubSchema[]) {
  const standardPlans = global.subPlans?.standard;
  let usePlans = plans;
  if (!usePlans) {
    usePlans = await MongoTeamSub.find({ teamId }).lean();
  }
  const teamStandardPlans = sortStandPlans(
    usePlans?.filter((plan) => plan.type === SubTypeEnum.standard) || []
  );
  const standardPlan = teamStandardPlans[0];
  const extraDatasetSize =
    usePlans?.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize) || [];
  const standardMaxDatasetSize =
    standardPlan?.currentSubLevel && standardPlans
      ? standardPlans[standardPlan.currentSubLevel]?.maxDatasetSize || Infinity
      : Infinity;
  const totalDatasetSize =
    standardMaxDatasetSize +
    extraDatasetSize.reduce((acc, cur) => acc + (cur.currentExtraDatasetSize || 0), 0);
  return totalDatasetSize;
}

export async function getTeamStandardConstantsByTeamId(teamId: string, plans?: TeamSubSchema[]) {
  const subLevelCacheKey = `${CacheKeyEnum.team_current_sub_level}:${teamId}`;
  let currentSubLevel = (await getRedisCache(subLevelCacheKey)) as StandardSubLevelEnum | null;
  if (!currentSubLevel) {
    const standard = await getTeamStandardPlanByTeamId(teamId, plans);
    currentSubLevel = standard?.currentSubLevel;
    if (currentSubLevel) {
      await setRedisCache(
        subLevelCacheKey,
        currentSubLevel,
        CacheKeyEnumTime.team_current_sub_level
      );
    }
  }
  if (!currentSubLevel) return undefined;
  const standardPlans = global.subPlans?.standard;
  const standardConstants = standardPlans?.[currentSubLevel];
  if (!standardConstants) return undefined;
  let standard;
  if (!plans) {
    standard = await getTeamStandardPlanByTeamId(teamId);
  } else {
    standard = pickHighestStandardPlan(plans.filter((plan) => plan.type === SubTypeEnum.standard));
  }
  return {
    ...standardConstants,
    maxTeamMember: standard?.maxTeamMember || standardConstants.maxTeamMember,
    maxAppAmount: standard?.maxApp || standardConstants.maxAppAmount,
    maxDatasetAmount: standard?.maxDataset || standardConstants.maxDatasetAmount
  };
}

export async function getTeamStandardPlanByTeamId(teamId: string, plans?: TeamSubSchema[]) {
  const usePlans = await getTeamStandardPlans(teamId, plans);
  return pickHighestStandardPlan(usePlans);
}

export async function getTeamStandardPlans(teamId: string, plans?: TeamSubSchema[]) {
  if (plans) return plans.filter((plan) => plan.type === SubTypeEnum.standard);
  return MongoTeamSub.find({ teamId, type: SubTypeEnum.standard }, undefined, {
    ...readFromSecondary
  });
}

export async function getTeamMaxTeamMemberByTeamId(teamId: string, plans?: TeamSubSchema[]) {
  const subLevel = await getRedisCache(`${CacheKeyEnum.team_current_sub_level}:${teamId}`);
  const cacheKey = `${CacheKeyEnum.team_member_count_max}:${teamId}:${subLevel || 'none'}`;
  const cache = await getRedisCache(cacheKey);
  if (cache) return Number(cache);
  const constants = await getTeamStandardConstantsByTeamId(teamId, plans);
  const value = constants?.maxTeamMember || 0;
  await setRedisCache(cacheKey, value, CacheKeyEnumTime.team_member_count_max);
  return value;
}

export async function getTeamMaxAppAmountByTeamId(teamId: string, plans?: TeamSubSchema[]) {
  const subLevel = await getRedisCache(`${CacheKeyEnum.team_current_sub_level}:${teamId}`);
  const cacheKey = `${CacheKeyEnum.team_app_count_max}:${teamId}:${subLevel || 'none'}`;
  const cache = await getRedisCache(cacheKey);
  if (cache) return Number(cache);
  const constants = await getTeamStandardConstantsByTeamId(teamId, plans);
  const value = constants?.maxAppAmount || 0;
  await setRedisCache(cacheKey, value, CacheKeyEnumTime.team_app_count_max);
  return value;
}

export async function getTeamMaxDatasetAmountByTeamId(teamId: string, plans?: TeamSubSchema[]) {
  const subLevel = await getRedisCache(`${CacheKeyEnum.team_current_sub_level}:${teamId}`);
  const cacheKey = `${CacheKeyEnum.team_dataset_count_max}:${teamId}:${subLevel || 'none'}`;
  const cache = await getRedisCache(cacheKey);
  if (cache) return Number(cache);
  const constants = await getTeamStandardConstantsByTeamId(teamId, plans);
  const value = constants?.maxDatasetAmount || 0;
  await setRedisCache(cacheKey, value, CacheKeyEnumTime.team_dataset_count_max);
  return value;
}

export async function getTeamPermissionWebsiteSyncByTeamId(
  teamId: string,
  plans?: TeamSubSchema[]
) {
  const constants = await getTeamStandardConstantsByTeamId(teamId, plans);
  return constants?.permissionWebsiteSync;
}

export function sortStandPlans(plans: TeamSubSchema[]) {
  return plans
    .slice()
    .sort(
      (a, b) =>
        standardSubLevelMap[b.currentSubLevel].weight -
        standardSubLevelMap[a.currentSubLevel].weight
    );
}

export function pickHighestStandardPlan(plans: TeamSubSchema[]) {
  return sortStandPlans(plans)[0];
}

export const getStandardPlansConfig = () => {
  return global?.subPlans?.standard;
};

export const getStandardPlanConfig = (level: `${StandardSubLevelEnum}`) => {
  return global.subPlans?.standard?.[level];
};

export const onDelTeamMemberCountCache = throttle(
  (teamId: string) => delRedisCache(`${CacheKeyEnum.team_member_count_max}:${teamId}`),
  CacheKeyEnumTime.team_member_count_max,
  { leading: true, trailing: true }
);
export const onDelTeamAppCountCache = throttle(
  (teamId: string) => delRedisCache(`${CacheKeyEnum.team_app_count_max}:${teamId}`),
  CacheKeyEnumTime.team_app_count_max,
  { leading: true, trailing: true }
);
export const onDelTeamDatasetCountCache = throttle(
  (teamId: string) => delRedisCache(`${CacheKeyEnum.team_dataset_count_max}:${teamId}`),
  CacheKeyEnumTime.team_dataset_count_max,
  { leading: true, trailing: true }
);
export const onDelTeamCurrentSubLevelCache = throttle(
  (teamId: string) => delRedisCache(`${CacheKeyEnum.team_current_sub_level}:${teamId}`),
  CacheKeyEnumTime.team_current_sub_level,
  { leading: true, trailing: true }
);
