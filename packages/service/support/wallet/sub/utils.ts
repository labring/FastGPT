import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
import { FeTeamPlanStatusType, TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type.d';
import { getVectorCountByTeamId } from '../../../common/vectorStore/controller';
import dayjs from 'dayjs';
import { ClientSession } from '../../../common/mongo';
import { addMonths } from 'date-fns';
import { readFromSecondary } from '../../../common/mongo/utils';

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

  return {
    [SubTypeEnum.standard]: standard,
    standardConstants:
      standard?.currentSubLevel && standardPlans
        ? standardPlans[standard.currentSubLevel]
        : undefined
  };
};

export const initTeamStandardPlan2Free = async ({
  teamId,
  session
}: {
  teamId: string;
  session?: ClientSession;
}) => {
  const freePoints = global?.subPlans?.standard?.[StandardSubLevelEnum.free]?.totalPoints || 100;

  const teamStandardSub = await MongoTeamSub.findOne({ teamId, type: SubTypeEnum.standard });

  if (teamStandardSub) {
    teamStandardSub.currentMode = SubModeEnum.month;
    teamStandardSub.nextMode = SubModeEnum.month;
    teamStandardSub.startTime = new Date();
    teamStandardSub.expiredTime = addMonths(new Date(), 1);

    teamStandardSub.currentSubLevel = StandardSubLevelEnum.free;
    teamStandardSub.nextSubLevel = StandardSubLevelEnum.free;

    teamStandardSub.totalPoints = freePoints;
    teamStandardSub.surplusPoints =
      teamStandardSub.surplusPoints && teamStandardSub.surplusPoints < 0
        ? teamStandardSub.surplusPoints + freePoints
        : freePoints;
    return teamStandardSub.save({ session });
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
    { session }
  );
};

export const getTeamPlanStatus = async ({
  teamId
}: {
  teamId: string;
}): Promise<FeTeamPlanStatusType> => {
  const standardPlans = global.subPlans?.standard;

  /* Get all plans and datasetSize */
  const [plans, usedDatasetSize] = await Promise.all([
    MongoTeamSub.find({ teamId }).lean(),
    getVectorCountByTeamId(teamId)
  ]);

  /* Get all standardPlans and active standardPlan */
  const teamStandardPlans = sortStandPlans(
    plans.filter((plan) => plan.type === SubTypeEnum.standard)
  );
  const standardPlan = teamStandardPlans[0];

  const extraDatasetSize = plans.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize);
  const extraPoints = plans.filter((plan) => plan.type === SubTypeEnum.extraPoints);

  // Free user, first login after expiration. The free subscription plan will be reset
  if (
    standardPlan &&
    standardPlan.expiredTime &&
    standardPlan.currentSubLevel === StandardSubLevelEnum.free &&
    dayjs(standardPlan.expiredTime).isBefore(new Date())
  ) {
    console.log('Init free stand plan', { teamId });
    await initTeamStandardPlan2Free({ teamId });
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
      ? standardPlans[standardPlan.currentSubLevel]?.maxDatasetSize || Infinity
      : Infinity;
  const totalDatasetSize =
    standardMaxDatasetSize +
    extraDatasetSize.reduce((acc, cur) => acc + (cur.currentExtraDatasetSize || 0), 0);

  return {
    [SubTypeEnum.standard]: standardPlan,
    standardConstants:
      standardPlan?.currentSubLevel && standardPlans
        ? standardPlans[standardPlan.currentSubLevel]
        : undefined,

    totalPoints,
    usedPoints: totalPoints - surplusPoints,

    datasetMaxSize: totalDatasetSize,
    usedDatasetSize
  };
};
