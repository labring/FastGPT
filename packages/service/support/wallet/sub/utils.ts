import { SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { MongoTeamSub } from './schema';
import { StandSubPlanLevelMapType } from '@fastgpt/global/support/wallet/sub/type.d';

export const getUserStandDardList = async (teamId: string) => {
  return MongoTeamSub.find({ teamId });
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
