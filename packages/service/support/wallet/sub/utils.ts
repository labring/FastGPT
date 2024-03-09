import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubStatusEnum,
  SubTypeEnum
} from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
import { FeTeamPlanStatusType } from '@fastgpt/global/support/wallet/sub/type.d';
import { getVectorCountByTeamId } from '../../../common/vectorStore/controller';
import dayjs from 'dayjs';
import { ClientSession } from '../../../common/mongo';
import { addMonths } from 'date-fns';

export const getStandardPlans = () => {
  return global?.subPlans?.standard;
};
export const getStandardPlan = (level: `${StandardSubLevelEnum}`) => {
  return global.subPlans?.standard?.[level];
};

export const getTeamStandPlan = async ({ teamId }: { teamId: string }) => {
  const standardPlans = global.subPlans?.standard;
  const standard = await MongoTeamSub.findOne({ teamId, type: SubTypeEnum.standard }).lean();

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
  const freePoints = global?.subPlans?.standard?.free?.totalPoints || 100;

  const teamStandardSub = await MongoTeamSub.findOne({ teamId, type: SubTypeEnum.standard });

  if (teamStandardSub) {
    teamStandardSub.status = SubStatusEnum.active;
    teamStandardSub.currentMode = SubModeEnum.month;
    teamStandardSub.nextMode = SubModeEnum.month;
    teamStandardSub.startTime = new Date();
    teamStandardSub.expiredTime = addMonths(new Date(), 1);

    teamStandardSub.currentSubLevel = StandardSubLevelEnum.free;
    teamStandardSub.nextSubLevel = StandardSubLevelEnum.free;

    teamStandardSub.price = 0;
    teamStandardSub.pointPrice = 0;

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
        status: SubStatusEnum.active,
        currentMode: SubModeEnum.month,
        nextMode: SubModeEnum.month,
        startTime: new Date(),
        expiredTime: addMonths(new Date(), 1),
        price: 0,
        pointPrice: 0,

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

  const [plans, usedDatasetSize] = await Promise.all([
    MongoTeamSub.find({ teamId }).lean(),
    getVectorCountByTeamId(teamId)
  ]);

  const standard = plans.find((plan) => plan.type === SubTypeEnum.standard);
  const extraDatasetSize = plans.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize);
  const extraPoints = plans.filter((plan) => plan.type === SubTypeEnum.extraPoints);

  // Free user, first login after expiration. The free subscription plan will be reset
  if (
    standard &&
    standard.expiredTime &&
    standard.currentSubLevel === StandardSubLevelEnum.free &&
    dayjs(standard.expiredTime).isBefore(new Date())
  ) {
    console.log('Init free stand plan', { teamId });
    await initTeamStandardPlan2Free({ teamId });
    return getTeamPlanStatus({ teamId });
  }

  const totalPoints = standardPlans
    ? (standard?.totalPoints || 0) +
      extraPoints.reduce((acc, cur) => acc + (cur.totalPoints || 0), 0)
    : Infinity;
  const surplusPoints =
    (standard?.surplusPoints || 0) +
    extraPoints.reduce((acc, cur) => acc + (cur.surplusPoints || 0), 0);

  const standardMaxDatasetSize =
    standard?.currentSubLevel && standardPlans
      ? standardPlans[standard.currentSubLevel]?.maxDatasetSize || Infinity
      : Infinity;
  const totalDatasetSize =
    standardMaxDatasetSize +
    extraDatasetSize.reduce((acc, cur) => acc + (cur.currentExtraDatasetSize || 0), 0);

  return {
    [SubTypeEnum.standard]: standard,
    standardConstants:
      standard?.currentSubLevel && standardPlans
        ? standardPlans[standard.currentSubLevel]
        : undefined,

    totalPoints,
    usedPoints: totalPoints - surplusPoints,

    datasetMaxSize: totalDatasetSize,
    usedDatasetSize
  };
};
