import { getVectorCountByTeamId } from '@fastgpt/service/common/vectorStore/controller';
import { getTeamSubPlans, getTeamStandPlan } from '@fastgpt/service/support/wallet/sub/utils';
import { getStandardSubPlan } from '../wallet/sub/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoPlugin } from '@fastgpt/service/core/plugin/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

export const checkDatasetLimit = async ({
  teamId,
  insertLen = 0
}: {
  teamId: string;
  insertLen?: number;
}) => {
  const [{ totalPoints, usedPoints, datasetMaxSize }, usedSize] = await Promise.all([
    getTeamSubPlans({ teamId, standardPlans: getStandardSubPlan() }),
    getVectorCountByTeamId(teamId)
  ]);

  if (usedSize + insertLen >= datasetMaxSize) {
    return Promise.reject(TeamErrEnum.datasetSizeNotEnough);
  }

  if (usedPoints >= totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }
  return;
};

export const checkTeamAIPoints = async (teamId: string) => {
  const { totalPoints, usedPoints } = await getTeamSubPlans({
    teamId,
    standardPlans: getStandardSubPlan()
  });

  if (usedPoints >= totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }

  return {
    totalPoints,
    usedPoints
  };
};

export const checkTeamDatasetLimit = async (teamId: string) => {
  const [{ standardConstants }, datasetCount] = await Promise.all([
    getTeamStandPlan({ teamId, standardPlans: getStandardSubPlan() }),
    MongoDataset.countDocuments({
      teamId,
      type: DatasetTypeEnum.dataset
    })
  ]);

  if (standardConstants && datasetCount >= standardConstants.maxDatasetAmount) {
    return Promise.reject(TeamErrEnum.datasetAmountNotEnough);
  }
};
export const checkTeamAppLimit = async (teamId: string) => {
  const [{ standardConstants }, appCount] = await Promise.all([
    getTeamStandPlan({ teamId, standardPlans: getStandardSubPlan() }),
    MongoApp.count({ teamId })
  ]);

  if (standardConstants && appCount >= standardConstants.maxAppAmount) {
    return Promise.reject(TeamErrEnum.appAmountNotEnough);
  }
};
export const checkTeamPluginLimit = async (teamId: string) => {
  const [{ standardConstants }, pluginCount] = await Promise.all([
    getTeamStandPlan({ teamId, standardPlans: getStandardSubPlan() }),
    MongoPlugin.count({ teamId })
  ]);

  if (standardConstants && pluginCount >= standardConstants.maxAppAmount) {
    return Promise.reject(TeamErrEnum.pluginAmountNotEnough);
  }
};

export const checkTeamReRankPermission = async (teamId: string) => {
  const { standardConstants } = await getTeamStandPlan({
    teamId,
    standardPlans: getStandardSubPlan()
  });

  if (standardConstants && !standardConstants?.permissionReRank) {
    return false;
  }
  return true;
};
export const checkTeamWebSyncPermission = async (teamId: string) => {
  const { standardConstants } = await getTeamStandPlan({
    teamId,
    standardPlans: getStandardSubPlan()
  });

  if (standardConstants && !standardConstants?.permissionWebsiteSync) {
    return Promise.reject(TeamErrEnum.websiteSyncNotEnough);
  }
};
