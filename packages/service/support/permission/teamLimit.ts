import { getTeamPlanStatus, getTeamStandPlan } from '../../support/wallet/sub/utils';
import { MongoApp } from '../../core/app/schema';
import { MongoDataset } from '../../core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

export const checkDatasetLimit = async ({
  teamId,
  insertLen = 0
}: {
  teamId: string;
  insertLen?: number;
}) => {
  const { standardConstants, totalPoints, usedPoints, datasetMaxSize, usedDatasetSize } =
    await getTeamPlanStatus({ teamId });

  if (!standardConstants) return;

  if (usedDatasetSize + insertLen >= datasetMaxSize) {
    return Promise.reject(
      `您的知识库容量为: ${datasetMaxSize}组，已使用: ${usedDatasetSize}组，导入当前文件需要: ${insertLen}组，请增加知识库容量后导入。`
    );
  }

  if (usedPoints >= totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }
  return;
};

export const checkTeamAIPoints = async (teamId: string) => {
  const { standardConstants, totalPoints, usedPoints } = await getTeamPlanStatus({
    teamId
  });

  if (!standardConstants) return;

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
    getTeamStandPlan({ teamId }),
    MongoDataset.countDocuments({
      teamId,
      type: { $ne: DatasetTypeEnum.folder }
    })
  ]);

  if (standardConstants && datasetCount >= standardConstants.maxDatasetAmount) {
    return Promise.reject(TeamErrEnum.datasetAmountNotEnough);
  }
  if (!global.feConfigs.isPlus && datasetCount >= 30) {
    return Promise.reject(SystemErrEnum.communityVersionNumLimit);
  }
};
export const checkTeamAppLimit = async (teamId: string, amount = 1) => {
  const [{ standardConstants }, appCount] = await Promise.all([
    getTeamStandPlan({ teamId }),
    MongoApp.count({
      teamId,
      type: { $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin] }
    })
  ]);

  if (standardConstants && appCount + amount >= standardConstants.maxAppAmount) {
    return Promise.reject(TeamErrEnum.appAmountNotEnough);
  }
};

export const checkTeamReRankPermission = async (teamId: string) => {
  const { standardConstants } = await getTeamStandPlan({
    teamId
  });

  if (standardConstants && !standardConstants?.permissionReRank) {
    return false;
  }
  return true;
};
