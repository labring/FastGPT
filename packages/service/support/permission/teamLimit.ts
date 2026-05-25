import { getTeamPlanStatus, getTeamStandPlan, teamPoint } from '../../support/wallet/sub/utils';
import { MongoApp } from '../../core/app/schema';
import { MongoDataset } from '../../core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import { AppTypeEnum, ToolTypeList, AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '../user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { getVectorCountByTeamId } from '../../common/vectorDB/controller';
import { MongoEvaluation } from '../../core/evaluation/task/schema';
import { MongoEvalDatasetCollection } from '../../core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../core/evaluation/dataset/evalDatasetDataSchema';
import { MongoEvalMetric } from '../../core/evaluation/metric/schema';
import { addLog } from '../../common/system/log';
import { env } from '../../env';

export const checkTeamAIPoints = async (teamId: string) => {
  addLog.debug('[checkTeamAIPoints] Global configuration', {
    hasSubPlans: !!global.subPlans,
    hasStandardPlan: !!global.subPlans?.standard,
    subPlansKeys: global.subPlans ? Object.keys(global.subPlans) : [],
    standardPlanKeys: global.subPlans?.standard ? Object.keys(global.subPlans.standard) : [],
    hasSystemEnv: !!global.systemEnv,
    hasFeConfigs: !!global.feConfigs,
    hasLicenseData: !!global.licenseData
  });

  if (!global.subPlans?.standard) {
    addLog.debug('[checkTeamAIPoints] Skip check - no standard plan configured', {
      teamId,
      hasSubPlans: !!global.subPlans,
      hasStandardPlan: !!global.subPlans?.standard
    });
    return;
  }

  const { totalPoints, usedPoints, surplusPoints } = await teamPoint.getTeamPoints({ teamId });

  addLog.debug('[checkTeamAIPoints] Team points balance check', {
    teamId,
    totalPoints,
    usedPoints,
    surplusPoints,
    isEnough: usedPoints < totalPoints
  });

  if (usedPoints >= totalPoints) {
    addLog.debug('[checkTeamAIPoints] Insufficient AI points', {
      teamId,
      totalPoints,
      usedPoints,
      surplusPoints,
      deficit: usedPoints - totalPoints
    });
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
      teamId
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
  if (folderCount + amount > env.DATASET_FOLDER_MAX_AMOUNT) {
    return Promise.reject(TeamErrEnum.datasetFolderAmountNotEnough);
  }
};

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
      getTeamStandPlan({ teamId }),
      MongoApp.countDocuments({
        teamId,
        type: {
          $in: [
            AppTypeEnum.chatAgent,
            AppTypeEnum.simple,
            AppTypeEnum.workflow,
            AppTypeEnum.assistant
          ]
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
          $in: [
            AppTypeEnum.chatAgent,
            AppTypeEnum.simple,
            AppTypeEnum.workflow,
            AppTypeEnum.assistant
          ]
        }
      });
      if (totalApps > global.licenseData.maxApps) {
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
    const maxAppFolderAmount = env.APP_FOLDER_MAX_AMOUNT;
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

  if (usedDatasetIndexSize + insertLen >= datasetMaxSize) {
    return Promise.reject(TeamErrEnum.datasetSizeNotEnough);
  }

  if (usedPoints >= totalPoints) {
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

export const checkTeamEvaluationTaskLimit = async (teamId: string, amount = 1) => {
  const [{ standardConstants }, evaluationTaskCount] = await Promise.all([
    getTeamStandPlan({ teamId }),
    MongoEvaluation.countDocuments({ teamId })
  ]);

  if (
    standardConstants &&
    standardConstants.maxEvaluationTaskAmount !== undefined &&
    evaluationTaskCount + amount > standardConstants.maxEvaluationTaskAmount
  ) {
    return Promise.reject(TeamErrEnum.evaluationTaskAmountNotEnough);
  }

  if (
    global?.licenseData?.maxEvaluationTaskAmount &&
    typeof global?.licenseData?.maxEvaluationTaskAmount === 'number'
  ) {
    const totalEvaluationTasks = await MongoEvaluation.countDocuments({});
    if (totalEvaluationTasks >= global.licenseData.maxEvaluationTaskAmount) {
      return Promise.reject(SystemErrEnum.licenseEvaluationTaskAmountLimit);
    }
  }
};

export const checkTeamEvalDatasetLimit = async (teamId: string, amount = 1) => {
  const [{ standardConstants }, evalDatasetCount] = await Promise.all([
    getTeamStandPlan({ teamId }),
    MongoEvalDatasetCollection.countDocuments({ teamId })
  ]);

  if (
    standardConstants &&
    standardConstants.maxEvalDatasetAmount !== undefined &&
    evalDatasetCount + amount > standardConstants.maxEvalDatasetAmount
  ) {
    return Promise.reject(TeamErrEnum.evaluationDatasetAmountNotEnough);
  }

  if (
    global?.licenseData?.maxEvalDatasetAmount &&
    typeof global?.licenseData?.maxEvalDatasetAmount === 'number'
  ) {
    const totalEvalDatasets = await MongoEvalDatasetCollection.countDocuments({});
    if (totalEvalDatasets >= global.licenseData.maxEvalDatasetAmount) {
      return Promise.reject(SystemErrEnum.licenseEvalDatasetAmountLimit);
    }
  }
};

export const checkTeamEvalDatasetDataLimit = async (teamId: string, amount = 1) => {
  const [{ standardConstants }, evalDatasetDataCount] = await Promise.all([
    getTeamStandPlan({ teamId }),
    MongoEvalDatasetData.countDocuments({ teamId })
  ]);

  if (
    standardConstants &&
    standardConstants.maxEvalDatasetDataAmount !== undefined &&
    evalDatasetDataCount + amount > standardConstants.maxEvalDatasetDataAmount
  ) {
    return Promise.reject(TeamErrEnum.evaluationDatasetDataAmountNotEnough);
  }

  if (
    global?.licenseData?.maxEvalDatasetDataAmount &&
    typeof global?.licenseData?.maxEvalDatasetDataAmount === 'number'
  ) {
    const totalEvalDatasetData = await MongoEvalDatasetData.countDocuments({});
    if (totalEvalDatasetData >= global.licenseData.maxEvalDatasetDataAmount) {
      return Promise.reject(SystemErrEnum.licenseEvalDatasetDataAmountLimit);
    }
  }
};

export const checkTeamEvalMetricLimit = async (teamId: string, amount = 1) => {
  const [{ standardConstants }, evalMetricCount] = await Promise.all([
    getTeamStandPlan({ teamId }),
    MongoEvalMetric.countDocuments({ teamId })
  ]);

  if (
    standardConstants &&
    standardConstants.maxEvalMetricAmount !== undefined &&
    evalMetricCount + amount > standardConstants.maxEvalMetricAmount
  ) {
    return Promise.reject(TeamErrEnum.evaluationMetricAmountNotEnough);
  }

  if (
    global?.licenseData?.maxEvalMetricAmount &&
    typeof global?.licenseData?.maxEvalMetricAmount === 'number'
  ) {
    const totalEvalMetrics = await MongoEvalMetric.countDocuments({});
    if (totalEvalMetrics >= global.licenseData.maxEvalMetricAmount) {
      return Promise.reject(SystemErrEnum.licenseEvalMetricAmountLimit);
    }
  }
};
