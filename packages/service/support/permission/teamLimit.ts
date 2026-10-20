import { getTeamPlanStatus, getTeamStandPlan, teamPoint } from '../../support/wallet/sub/utils';
import { MongoApp } from '../../core/app/schema';
import { MongoDataset } from '../../core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { AppTypeList, ToolTypeList, AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '../user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { getVectorCountByTeamId } from '../../common/vectorDB/controller';
import { ReadPreference } from '../../common/mongo';
import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/controller';
import { logInstanceConfigRead } from '../../common/system/migrationCoverageLog';
import { serviceEnv } from '../../env';

export const checkTeamAIPoints = async (teamId: string) => {
  if (!global.subPlans?.standard) return;

  const { totalPoints, usedPoints } = await teamPoint.getTeamPoints({ teamId });

  if (usedPoints !== null && totalPoints !== null && usedPoints >= totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }

  return {
    totalPoints,
    usedPoints
  };
};

export const checkTeamMemberLimit = async (teamId: string, newCount: number) => {
  const [{ standard }, memberCount] = await Promise.all([
    getTeamStandPlan({
      teamId,
      // 成员上限属于强一致的权限校验，不能接受从库复制延迟导致放行超额成员。
      readPreference: ReadPreference.PRIMARY
    }),
    MongoTeamMember.countDocuments({
      teamId,
      status: { $ne: TeamMemberStatusEnum.leave }
    })
  ]);

  if (standard?.maxTeamMember && newCount + memberCount > standard.maxTeamMember) {
    return Promise.reject(TeamErrEnum.teamOverSize);
  }
};

export const checkTeamDatasetFolderLimit = async ({
  teamId,
  amount = 1
}: {
  teamId: string;
  amount?: number;
}) => {
  const folderCount = await MongoDataset.countDocuments({
    teamId,
    type: DatasetTypeEnum.folder
  });
  const configuredMaxDatasetFolderAmount =
    getSystemInstanceConfig().resource.datasetFolderMaxAmount;
  const maxDatasetFolderAmount =
    configuredMaxDatasetFolderAmount ?? serviceEnv.DATASET_FOLDER_MAX_AMOUNT;
  logInstanceConfigRead({
    callsite: 'runtime.support.permission.teamLimit.checkTeamDatasetFolderLimit',
    source: configuredMaxDatasetFolderAmount === undefined ? 'env-fallback' : 'instance-config',
    fields: [
      {
        path: 'resource.datasetFolderMaxAmount',
        value: configuredMaxDatasetFolderAmount ?? maxDatasetFolderAmount
      }
    ]
  });
  if (folderCount + amount > maxDatasetFolderAmount) {
    return Promise.reject(TeamErrEnum.datasetFolderAmountNotEnough);
  }
};

/** 按 Agent、工具、文件夹分别校验新增数量，Agent 口径与账号资源用量共用 AppTypeList。 */
export const checkTeamAppTypeLimit = async ({
  teamId,
  appCheckType,
  amount = 1
}: {
  teamId: string;
  appCheckType: 'app' | 'tool' | 'folder';
  amount?: number;
}) => {
  if (appCheckType === 'app') {
    const [{ standard }, appCount] = await Promise.all([
      getTeamStandPlan({ teamId, readPreference: ReadPreference.PRIMARY }),
      MongoApp.countDocuments({
        teamId,
        type: {
          $in: AppTypeList
        }
      })
    ]);

    if (standard?.maxAppAmount && appCount + amount > standard.maxAppAmount) {
      return Promise.reject(TeamErrEnum.appAmountNotEnough);
    }

    // System check
    if (global?.licenseData?.maxApps && typeof global?.licenseData?.maxApps === 'number') {
      const totalApps = await MongoApp.countDocuments({
        type: {
          $in: AppTypeList
        }
      });
      if (totalApps + amount > global.licenseData.maxApps) {
        return Promise.reject(SystemErrEnum.licenseAppAmountLimit);
      }
    }
  } else if (appCheckType === 'tool') {
    const toolCount = await MongoApp.countDocuments({
      teamId,
      type: {
        $in: ToolTypeList
      }
    });
    const maxToolAmount = 1000;
    if (toolCount + amount > maxToolAmount) {
      return Promise.reject(TeamErrEnum.pluginAmountNotEnough);
    }
  } else if (appCheckType === 'folder') {
    const folderCount = await MongoApp.countDocuments({
      teamId,
      type: {
        $in: AppFolderTypeList
      }
    });
    const configuredMaxAppFolderAmount = getSystemInstanceConfig().resource.appFolderMaxAmount;
    const maxAppFolderAmount = configuredMaxAppFolderAmount ?? serviceEnv.APP_FOLDER_MAX_AMOUNT;
    logInstanceConfigRead({
      callsite: 'runtime.support.permission.teamLimit.checkTeamAppTypeLimit',
      source: configuredMaxAppFolderAmount === undefined ? 'env-fallback' : 'instance-config',
      fields: [
        {
          path: 'resource.appFolderMaxAmount',
          value: configuredMaxAppFolderAmount ?? maxAppFolderAmount
        }
      ]
    });
    if (folderCount + amount > maxAppFolderAmount) {
      return Promise.reject(TeamErrEnum.appFolderAmountNotEnough);
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
  const [{ standard, totalPoints, usedPoints, datasetMaxSize }, usedDatasetIndexSize] =
    await Promise.all([getTeamPlanStatus({ teamId }), getVectorCountByTeamId(teamId)]);

  if (!standard) return;

  if (datasetMaxSize !== null && usedDatasetIndexSize + insertLen >= datasetMaxSize) {
    return Promise.reject(TeamErrEnum.datasetSizeNotEnough);
  }

  if (usedPoints !== null && totalPoints !== null && usedPoints >= totalPoints) {
    return Promise.reject(TeamErrEnum.aiPointsNotEnough);
  }
  return;
};

export const checkTeamDatasetLimit = async (teamId: string) => {
  const [{ standard }, datasetCount] = await Promise.all([
    getTeamStandPlan({ teamId }),
    MongoDataset.countDocuments({
      teamId,
      type: { $ne: DatasetTypeEnum.folder }
    })
  ]);

  // User check
  if (standard?.maxDatasetAmount && datasetCount >= standard.maxDatasetAmount) {
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
};

export const checkTeamDatasetSyncPermission = async (teamId: string) => {
  const { standard } = await getTeamStandPlan({
    teamId
  });

  if (standard && !standard?.websiteSyncPerDataset) {
    return Promise.reject(TeamErrEnum.websiteSyncNotEnough);
  }
};

export const checkTeamSandboxPermission = async (teamId: string) => {
  if (!global.subPlans?.standard) return;

  const { standard } = await getTeamStandPlan({
    teamId
  });

  if (standard && !standard?.enableSandbox) {
    return Promise.reject(TeamErrEnum.sandboxNotSupport);
  }
};
