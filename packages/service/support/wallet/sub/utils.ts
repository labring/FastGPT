import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
import { addHours } from 'date-fns';
import { FeTeamSubType, StandSubPlanLevelMapType } from '@fastgpt/global/support/wallet/sub/type.d';
import { getVectorCountByTeamId } from '../../../common/vectorStore/controller';

/* get team dataset max size */
export const getTeamDatasetMaxSize = async ({
  teamId,
  standardPlans
}: {
  teamId: string;
  standardPlans?: StandSubPlanLevelMapType;
}) => {
  if (!standardPlans) {
    return {
      maxSize: Infinity,
      sub: null
    };
  }

  const plans = await MongoTeamSub.find({
    teamId,
    expiredTime: { $gte: addHours(new Date(), -3) }
  }).lean();

  const standard = plans.find((plan) => plan.type === SubTypeEnum.standard);
  const extraDatasetSize = plans.find((plan) => plan.type === SubTypeEnum.extraDatasetSize);

  const standardMaxDatasetSize =
    standard?.currentSubLevel && standardPlans
      ? standardPlans[standard.currentSubLevel]?.maxDatasetSize || Infinity
      : Infinity;
  const totalDatasetSize =
    standardMaxDatasetSize + (extraDatasetSize?.currentExtraDatasetSize || 0);

  return {
    maxSize: totalDatasetSize,
    sub: extraDatasetSize
  };
};

export const getTeamSubPlanStatus = async ({
  teamId,
  standardPlans
}: {
  teamId: string;
  standardPlans?: StandSubPlanLevelMapType;
}): Promise<FeTeamSubType> => {
  const [plans, usedDatasetSize] = await Promise.all([
    MongoTeamSub.find({ teamId }).lean(),
    getVectorCountByTeamId(teamId)
  ]);

  const standard = plans.find((plan) => plan.type === SubTypeEnum.standard);
  const extraDatasetSize = plans.find((plan) => plan.type === SubTypeEnum.extraDatasetSize);
  const extraPoints = plans.find((plan) => plan.type === SubTypeEnum.extraPoints);

  const standardMaxDatasetSize =
    standard?.currentSubLevel && standardPlans
      ? standardPlans[standard.currentSubLevel]?.maxDatasetSize || Infinity
      : Infinity;
  const totalDatasetSize =
    standardMaxDatasetSize + (extraDatasetSize?.currentExtraDatasetSize || 0);

  const standardMaxPoints =
    standard?.currentSubLevel && standardPlans
      ? standardPlans[standard.currentSubLevel]?.totalPoints || Infinity
      : Infinity;
  const totalPoints = standardMaxPoints + (extraPoints?.currentExtraPoints || 0);

  const surplusPoints = (standard?.surplusPoints || 0) + (extraPoints?.surplusPoints || 0);

  return {
    [SubTypeEnum.standard]: standard,
    [SubTypeEnum.extraDatasetSize]: extraDatasetSize,
    [SubTypeEnum.extraPoints]: extraPoints,

    standardMaxDatasetSize,
    datasetMaxSize: totalDatasetSize,
    usedDatasetSize,

    standardMaxPoints,
    totalPoints,
    usedPoints: totalPoints - surplusPoints
  };
};
