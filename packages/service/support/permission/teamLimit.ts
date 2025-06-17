import { getTeamPlanStatus, getTeamStandPlan, getTeamPoints } from '../../support/wallet/sub/utils';
import { MongoApp } from '../../core/app/schema';
import { MongoDataset } from '../../core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '../user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { getVectorCountByTeamId } from '../../common/vectorDB/controller';

export const checkTeamAIPoints = async (teamId: string) => {
  if (!global.subPlans?.standard) return;

  const { totalPoints, usedPoints } = await getTeamPoints({ teamId });

  if (usedPoints >= totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }

  return {
    totalPoints,
    usedPoints
  };
};

export const checkTeamMemberLimit = async (teamId: string, newCount: number) => {
  const [{ standardConstants }, memberCount] = await Promise.all([
    getTeamStandPlan({
      teamId
    }),
    MongoTeamMember.countDocuments({
      teamId,
      status: { $ne: TeamMemberStatusEnum.leave }
    })
  ]);

  if (standardConstants && newCount + memberCount > standardConstants.maxTeamMember) {
    return Promise.reject(TeamErrEnum.teamOverSize);
  }
};

export const checkTeamAppLimit = async (teamId: string, amount = 1) => {
  const [{ standardConstants }, appCount] = await Promise.all([
    getTeamStandPlan({ teamId }),
    MongoApp.countDocuments({
      teamId,
      type: {
        $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin, AppTypeEnum.tool]
      }
    })
  ]);

  if (standardConstants && appCount + amount >= standardConstants.maxAppAmount) {
    return Promise.reject(TeamErrEnum.appAmountNotEnough);
  }

  // System check
  if (global?.licenseData?.maxApps && typeof global?.licenseData?.maxApps === 'number') {
    const totalApps = await MongoApp.countDocuments({
      type: {
        $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin, AppTypeEnum.tool]
      }
    });
    if (totalApps >= global.licenseData.maxApps) {
      return Promise.reject(SystemErrEnum.licenseAppAmountLimit);
    }
  }
};

export const checkDatasetIndexLimit = async ({
  teamId,
  insertLen = 0
}: {
  teamId: string;
  insertLen?: number;
}) => {
  const [{ standardConstants, totalPoints, usedPoints, datasetMaxSize }, usedDatasetIndexSize] =
    await Promise.all([getTeamPlanStatus({ teamId }), getVectorCountByTeamId(teamId)]);

  if (!standardConstants) return;

  if (usedDatasetIndexSize + insertLen >= datasetMaxSize) {
    return Promise.reject(TeamErrEnum.datasetSizeNotEnough);
  }

  if (usedPoints >= totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }
  return;
};

export const checkTeamDatasetLimit = async (teamId: string) => {
  const [{ standardConstants }, datasetCount] = await Promise.all([
    getTeamStandPlan({ teamId }),
    MongoDataset.countDocuments({
      teamId,
      type: { $ne: DatasetTypeEnum.folder }
    })
  ]);

  // User check
  if (standardConstants && datasetCount >= standardConstants.maxDatasetAmount) {
    return Promise.reject(TeamErrEnum.datasetAmountNotEnough);
  }

  // System check
  if (global?.licenseData?.maxDatasets && typeof global?.licenseData?.maxDatasets === 'number') {
    const totalDatasets = await MongoDataset.countDocuments({
      type: { $ne: DatasetTypeEnum.folder }
    });
    if (totalDatasets >= global.licenseData.maxDatasets) {
      return Promise.reject(SystemErrEnum.licenseDatasetAmountLimit);
    }
  }
  // Open source check
  if (!global.feConfigs.isPlus && datasetCount >= 30) {
    return Promise.reject(SystemErrEnum.communityVersionNumLimit);
  }
};

export const checkTeamWebSyncPermission = async (teamId: string) => {
  const { standardConstants } = await getTeamStandPlan({
    teamId
  });

  if (standardConstants && !standardConstants?.permissionWebsiteSync) {
    return Promise.reject(TeamErrEnum.websiteSyncNotEnough);
  }
};
