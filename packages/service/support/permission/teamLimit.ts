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

export const checkTeamAIPoints = async (teamId: string) => {
  if (!global.subPlans?.standard) return;

  const { totalPoints, usedPoints } = await teamPoint.getTeamPoints({ teamId });

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
    const [{ standardConstants }, appCount] = await Promise.all([
      getTeamStandPlan({ teamId }),
      MongoApp.countDocuments({
        teamId,
        type: {
          $in: [AppTypeEnum.simple, AppTypeEnum.workflow]
        }
      })
    ]);

    if (standardConstants && appCount + amount > standardConstants.maxAppAmount) {
      return Promise.reject(TeamErrEnum.appAmountNotEnough);
    }

    // System check
    if (global?.licenseData?.maxApps && typeof global?.licenseData?.maxApps === 'number') {
      const totalApps = await MongoApp.countDocuments({
        type: {
          $in: [AppTypeEnum.simple, AppTypeEnum.workflow]
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
    const maxAppFolderAmount = 1000;
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
};

export const checkTeamDatasetSyncPermission = async (teamId: string) => {
  const { standardConstants } = await getTeamStandPlan({
    teamId
  });

  if (standardConstants && !standardConstants?.websiteSyncPerDataset) {
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
