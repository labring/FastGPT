import {
  getTeamPlanStatus,
  getTeamStandardConstantsByTeamId,
  getTeamPointsByTeamId,
  getTeamMaxTeamMemberByTeamId,
  getTeamMaxAppAmountByTeamId,
  getTeamMaxDatasetAmountByTeamId,
  getTeamDatasetMaxSizeByTeamId,
  getTeamPermissionWebsiteSyncByTeamId
} from '../../support/wallet/sub/utils';
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
  const { totalPoints, surplusPoints, usedPoints } = await getTeamPointsByTeamId(teamId);
  if (usedPoints >= totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }
  return {
    totalPoints,
    usedPoints
  };
};

export const checkTeamMemberLimit = async (teamId: string, newCount: number) => {
  const [maxTeamMember, memberCount] = await Promise.all([
    getTeamMaxTeamMemberByTeamId(teamId),
    MongoTeamMember.countDocuments({
      teamId,
      status: { $ne: TeamMemberStatusEnum.leave }
    })
  ]);

  if (maxTeamMember != null && newCount + memberCount > maxTeamMember) {
    return Promise.reject(TeamErrEnum.teamOverSize);
  }
};

export const checkTeamAppLimit = async (teamId: string, amount = 1) => {
  const [maxAppAmount, appCount] = await Promise.all([
    getTeamMaxAppAmountByTeamId(teamId),
    MongoApp.countDocuments({
      teamId,
      type: {
        $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin, AppTypeEnum.tool]
      }
    })
  ]);

  if (maxAppAmount != null && appCount + amount >= maxAppAmount) {
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
  const [datasetMaxSize, points, usedDatasetIndexSize] = await Promise.all([
    getTeamDatasetMaxSizeByTeamId(teamId),
    getTeamPointsByTeamId(teamId),
    getVectorCountByTeamId(teamId)
  ]);
  if (usedDatasetIndexSize + insertLen >= (datasetMaxSize ?? Infinity)) {
    return Promise.reject(TeamErrEnum.datasetSizeNotEnough);
  }
  if (points.usedPoints >= points.totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }
  return;
};

export const checkTeamDatasetLimit = async (teamId: string) => {
  const [maxDatasetAmount, datasetCount] = await Promise.all([
    getTeamMaxDatasetAmountByTeamId(teamId),
    MongoDataset.countDocuments({
      teamId,
      type: { $ne: DatasetTypeEnum.folder }
    })
  ]);

  // User check
  if (maxDatasetAmount != null && datasetCount >= maxDatasetAmount) {
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
  const permissionWebsiteSync = await getTeamPermissionWebsiteSyncByTeamId(teamId);
  if (!permissionWebsiteSync) {
    return Promise.reject(TeamErrEnum.websiteSyncNotEnough);
  }
};
