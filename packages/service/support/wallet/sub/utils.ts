import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
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
      maxSize: Infinity
    };
  }

  const plans = await MongoTeamSub.find({
    teamId,
    type: [SubTypeEnum.standard, SubTypeEnum.extraDatasetSize]
  }).lean();

  const standard = plans.find((plan) => plan.type === SubTypeEnum.standard);
  const extraDatasetSize = plans.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize);

  const standardMaxDatasetSize =
    standard?.currentSubLevel && standardPlans
      ? standardPlans[standard.currentSubLevel]?.maxDatasetSize || Infinity
      : Infinity;

  const totalDatasetSize =
    standardMaxDatasetSize +
    extraDatasetSize.reduce((acc, cur) => acc + cur.currentExtraDatasetSize, 0);

  return {
    maxSize: totalDatasetSize
  };
};

export const getTeamStandardPlan = async ({
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
  const extraDatasetSize = plans.filter((plan) => plan.type === SubTypeEnum.extraDatasetSize);
  const extraPoints = plans.filter((plan) => plan.type === SubTypeEnum.extraPoints);

  const totalPoints =
    (standard?.totalPoints || 0) +
    extraPoints.reduce((acc, cur) => acc + (cur.totalPoints || 0), 0);
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

    totalPoints,
    usedPoints: totalPoints - surplusPoints,

    datasetMaxSize: totalDatasetSize,
    usedDatasetSize
  };
};
