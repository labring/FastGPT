import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
import {
  FeTeamPlanStatusType,
  StandSubPlanLevelMapType
} from '@fastgpt/global/support/wallet/sub/type.d';
import { getVectorCountByTeamId } from '../../../common/vectorStore/controller';

export const getTeamSubPlans = async ({
  teamId,
  standardPlans
}: {
  teamId: string;
  standardPlans?: StandSubPlanLevelMapType;
}): Promise<FeTeamPlanStatusType> => {
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
export const getTeamStandPlan = async ({
  teamId,
  standardPlans
}: {
  teamId: string;
  standardPlans?: StandSubPlanLevelMapType;
}) => {
  const standard = await MongoTeamSub.findOne({ teamId, type: SubTypeEnum.standard }).lean();

  return {
    [SubTypeEnum.standard]: standard,
    standardConstants:
      standard?.currentSubLevel && standardPlans
        ? standardPlans[standard.currentSubLevel]
        : undefined
  };
};
