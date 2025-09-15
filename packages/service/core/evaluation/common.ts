import { Types } from 'mongoose';
import type { AuthModeType } from '../../support/permission/type';
import { authEvaluation } from '../../support/permission/evaluation/auth';
import { authEvalDataset, authEvalMetric } from '../../support/permission/evaluation/auth';
import { authUserPer } from '../../support/permission/user/auth';
import { TeamEvaluationCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import {
  ReadPermissionVal,
  WritePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import type {
  EvalTarget,
  EvaluationWithPerType,
  EvaluationItemSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { authApp } from '../../support/permission/app/auth';
import { authDataset } from '../../support/permission/dataset/auth';
import { MongoEvalItem } from './task/schema';
import { MongoEvalDatasetData } from './dataset/evalDatasetDataSchema';
import { MongoResourcePermission } from '../../support/permission/schema';
import { getGroupsByTmbId } from '../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../support/permission/org/controllers';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export const buildListQuery = (
  teamId: string,
  searchKey?: string,
  searchFields: string[] = ['name', 'description']
): any => {
  const filter: any = { teamId: new Types.ObjectId(teamId) };

  if (searchKey) {
    filter.$or = searchFields.map((field) => ({
      [field]: { $regex: searchKey, $options: 'i' }
    }));
  }

  return filter;
};

export const buildPaginationOptions = (page: number = 1, pageSize: number = 20) => ({
  skip: (page - 1) * pageSize,
  limit: pageSize,
  sort: { createTime: -1 as const }
});

export const getEvaluationPermissionAggregation = async (
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  isOwner: boolean;
  roleList: any[];
  myGroupMap: Map<string, 1>;
  myOrgSet: Set<string>;
}> => {
  // Auth user permission - supports API Key and Token authentication
  const {
    tmbId,
    teamId,
    permission: teamPer
  } = await authUserPer({
    ...auth,
    per: ReadPermissionVal
  });

  // Get team all evaluation permissions
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.evaluation,
      teamId,
      resourceId: {
        $exists: true
      }
    }).lean(),
    getGroupsByTmbId({
      tmbId,
      teamId
    }).then((item) => {
      const map = new Map<string, 1>();
      item.forEach((item) => {
        map.set(String(item._id), 1);
      });
      return map;
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    })
  ]);

  return {
    teamId,
    tmbId,
    isOwner: teamPer.isOwner,
    roleList,
    myGroupMap,
    myOrgSet
  };
};

// ================ Evaluation module authorization functions ================

export const authEvaluationTaskCreate = async (
  target: EvalTarget,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    per: TeamEvaluationCreatePermissionVal
  });

  if (target.type == 'workflow') {
    if (!target.config?.appId) {
      return Promise.reject(EvaluationErrEnum.evalTargetAppIdMissing);
    }
    await authApp({
      ...auth,
      appId: target.config.appId,
      per: ReadPermissionVal
    });
  }

  return {
    teamId,
    tmbId
  };
};

export const authEvaluationTaskRead = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationWithPerType;
  teamId: string;
  tmbId: string;
}> => {
  const { evaluation, teamId, tmbId } = await authEvaluation({
    ...auth,
    evaluationId,
    per: ReadPermissionVal
  });

  return { evaluation, teamId, tmbId };
};

export const authEvaluationTaskWrite = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationWithPerType;
  teamId: string;
  tmbId: string;
}> => {
  const { evaluation, teamId, tmbId } = await authEvaluation({
    ...auth,
    evaluationId,
    per: WritePermissionVal
  });

  return { evaluation, teamId, tmbId };
};

export const authEvaluationTaskExecution = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationWithPerType;
  teamId: string;
  tmbId: string;
}> => {
  const { evaluation, teamId, tmbId } = await authEvaluation({
    ...auth,
    evaluationId,
    per: WritePermissionVal
  });

  if (evaluation.target.type == 'workflow') {
    if (!evaluation.target.config?.appId) {
      return Promise.reject(EvaluationErrEnum.evalTargetAppIdMissing);
    }
    await authApp({
      ...auth,
      appId: evaluation.target.config.appId,
      per: ReadPermissionVal
    });
  }

  return {
    evaluation,
    teamId,
    tmbId
  };
};

// ================ Evaluation item authorization functions ================

export const authEvaluationItemRead = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationWithPerType;
  evaluationItem: EvaluationItemSchemaType;
  teamId: string;
  tmbId: string;
}> => {
  const evaluationItem = await MongoEvalItem.findById(evalItemId).lean();
  if (!evaluationItem) {
    throw new Error(EvaluationErrEnum.evalItemNotFound);
  }

  const { teamId, tmbId, evaluation } = await authEvaluationTaskRead(evaluationItem.evalId, auth);

  return {
    evaluation,
    evaluationItem,
    teamId,
    tmbId
  };
};

export const authEvaluationItemWrite = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationWithPerType;
  evaluationItem: EvaluationItemSchemaType;
  teamId: string;
  tmbId: string;
}> => {
  const evaluationItem = await MongoEvalItem.findById(evalItemId).lean();
  if (!evaluationItem) {
    throw new Error(EvaluationErrEnum.evalItemNotFound);
  }

  const { teamId, tmbId, evaluation } = await authEvaluationTaskWrite(evaluationItem.evalId, auth);

  return {
    evaluation,
    evaluationItem,
    teamId,
    tmbId
  };
};

export const authEvaluationItemRetry = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationWithPerType;
  evaluationItem: EvaluationItemSchemaType;
  teamId: string;
  tmbId: string;
}> => {
  return await authEvaluationItemWrite(evalItemId, auth);
};

// ================ Evaluation dataset authorization functions ================

export const authEvaluationDatasetCreate = async (
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    per: TeamEvaluationCreatePermissionVal
  });

  return { teamId, tmbId };
};
export const authEvaluationDatasetRead = async (
  datasetId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  datasetId: string;
}> => {
  const { teamId, tmbId } = await authEvalDataset({
    ...auth,
    datasetId,
    per: ReadPermissionVal
  });

  return { teamId, tmbId, datasetId };
};

export const authEvaluationDatasetWrite = async (
  datasetId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  datasetId: string;
}> => {
  const { teamId, tmbId } = await authEvalDataset({
    ...auth,
    datasetId,
    per: WritePermissionVal
  });

  return { teamId, tmbId, datasetId };
};

export const authEvaluationDatasetGenFromKnowledgeBase = async (
  collectionId: string,
  kbDatasetIds: string[],
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  const { teamId, tmbId } = await authEvaluationDatasetRead(collectionId, auth);

  await Promise.all(
    kbDatasetIds.map((datasetId) =>
      authDataset({
        ...auth,
        datasetId,
        per: ReadPermissionVal
      })
    )
  );

  return {
    teamId,
    tmbId
  };
};

// ================ Evaluation metric authorization functions ================

export const authEvaluationMetricCreate = async (
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    per: TeamEvaluationCreatePermissionVal
  });

  return { teamId, tmbId };
};

export const authEvaluationMetricRead = async (
  metricId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  metricId: string;
}> => {
  const { teamId, tmbId } = await authEvalMetric({
    ...auth,
    metricId,
    per: ReadPermissionVal
  });

  return { teamId, tmbId, metricId };
};
export const authEvaluationMetricWrite = async (
  metricId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  metricId: string;
}> => {
  const { teamId, tmbId } = await authEvalMetric({
    ...auth,
    metricId,
    per: WritePermissionVal
  });

  return { teamId, tmbId, metricId };
};

// ================ Evaluation dataset data authorization functions ================
export const authEvaluationDatasetDataRead = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  const { teamId, tmbId } = await authEvaluationDatasetRead(collectionId, auth);

  return { teamId, tmbId, collectionId };
};

export const authEvaluationDatasetDataWrite = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  const { teamId, tmbId } = await authEvaluationDatasetWrite(collectionId, auth);

  return { teamId, tmbId, collectionId };
};

export const authEvaluationDatasetDataCreate = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  return await authEvaluationDatasetDataWrite(collectionId, auth);
};

export const authEvaluationDatasetDataDelete = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  return await authEvaluationDatasetDataWrite(collectionId, auth);
};

export const authEvaluationDatasetDataUpdate = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  return await authEvaluationDatasetDataWrite(collectionId, auth);
};

export const authEvaluationDatasetDataUpdateById = async (
  dataId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  const dataItem = await MongoEvalDatasetData.findById(dataId)
    .select('evalDatasetCollectionId')
    .lean();
  if (!dataItem) {
    throw new Error(EvaluationErrEnum.datasetDataNotFound);
  }

  const collectionId = String(dataItem.evalDatasetCollectionId);
  return await authEvaluationDatasetDataUpdate(collectionId, auth);
};

export const authEvaluationDatasetDataReadById = async (
  dataId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  const dataItem = await MongoEvalDatasetData.findById(dataId)
    .select('evalDatasetCollectionId')
    .lean();
  if (!dataItem) {
    throw new Error(EvaluationErrEnum.datasetDataNotFound);
  }

  const collectionId = String(dataItem.evalDatasetCollectionId);
  return await authEvaluationDatasetDataRead(collectionId, auth);
};
