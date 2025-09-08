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
  EvaluationDetailType,
  EvaluationItemSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { authApp } from '../../support/permission/app/auth';
import { authDatasetCollection } from '../../support/permission/dataset/auth';
import { MongoEvalItem } from './task/schema';
import { MongoEvalDatasetData } from './dataset/evalDatasetDataSchema';
import { MongoResourcePermission } from '../../support/permission/schema';
import { getGroupsByTmbId } from '../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../support/permission/org/controllers';

// Generic validation functions removed - replaced with resource-specific functions below
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
// Generic list validation removed - replaced with resource-specific functions below
export const buildPaginationOptions = (page: number = 1, pageSize: number = 20) => ({
  skip: (page - 1) * pageSize,
  limit: pageSize,
  sort: { createTime: -1 as const }
});
export const checkUpdateResult = (result: any, resourceName: string = 'Resource') => {
  if (result.matchedCount === 0) {
    throw new Error(`${resourceName} not found`);
  }
};

export const checkDeleteResult = (result: any, resourceName: string = 'Resource') => {
  if (result.deletedCount === 0) {
    throw new Error(`${resourceName} not found`);
  }
};

/**
 * 获取用户的评估权限聚合信息（用于列表查询）
 */
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
  // Auth user permission - 支持API Key和Token认证
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

// ================ 评估模块专用权限验证函数 ================

/**
 * 验证评估任务创建权限
 * 包含: 团队创建权限 + target关联APP读权限
 */
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
      return Promise.reject('Invalid target configuration: missing appId');
    }
    await authApp({
      ...auth,
      appId: target.config.appId,
      per: ReadPermissionVal // APP需要读权限才能被评估调用
    });
  }

  return {
    teamId,
    tmbId
  };
};

/**
 * 验证评估任务读取权限
 */
export const authEvaluationTaskRead = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationDetailType;
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

/**
 * 验证评估任务写入权限
 */
export const authEvaluationTaskWrite = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationDetailType;
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

/**
 * 验证评估任务执行权限
 * 包含: 评估写权限 + target关联APP读权限
 */
export const authEvaluationTaskExecution = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationDetailType;
  teamId: string;
  tmbId: string;
}> => {
  // 验证评估任务的写权限并获取详情
  const { evaluation, teamId, tmbId } = await authEvaluation({
    ...auth,
    evaluationId,
    per: WritePermissionVal
  });

  // 验证target关联APP的读权限
  if (evaluation.target.type == 'workflow') {
    if (!evaluation.target.config?.appId) {
      return Promise.reject('Invalid target configuration: missing appId');
    }
    await authApp({
      ...auth,
      appId: evaluation.target.config.appId,
      per: ReadPermissionVal // APP需要读权限才能被评估调用
    });
  }

  return {
    evaluation,
    teamId,
    tmbId
  };
};

// ================ 评估项目(EvaluationItem)专用权限验证函数 ================

/**
 * 验证评估项目读取权限
 */
export const authEvaluationItemRead = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationDetailType;
  evaluationItem: EvaluationItemSchemaType;
  teamId: string;
  tmbId: string;
}> => {
  // 根据evalItemId获取完整的evalItem信息
  const evaluationItem = await MongoEvalItem.findById(evalItemId).lean();
  if (!evaluationItem) {
    throw new Error('Evaluation item not found');
  }

  // 验证评估任务的读权限并获取evaluation
  const { teamId, tmbId, evaluation } = await authEvaluationTaskRead(evaluationItem.evalId, auth);

  return {
    evaluation,
    evaluationItem,
    teamId,
    tmbId
  };
};

/**
 * 验证评估项目写入权限
 */
export const authEvaluationItemWrite = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationDetailType;
  evaluationItem: EvaluationItemSchemaType;
  teamId: string;
  tmbId: string;
}> => {
  // 根据evalItemId获取完整的evalItem信息
  const evaluationItem = await MongoEvalItem.findById(evalItemId).lean();
  if (!evaluationItem) {
    throw new Error('Evaluation item not found');
  }

  // 验证评估任务的写权限并获取evaluation
  const { teamId, tmbId, evaluation } = await authEvaluationTaskWrite(evaluationItem.evalId, auth);

  return {
    evaluation,
    evaluationItem,
    teamId,
    tmbId
  };
};

/**
 * 验证评估项目重试权限
 */
export const authEvaluationItemRetry = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationDetailType;
  evaluationItem: EvaluationItemSchemaType;
  teamId: string;
  tmbId: string;
}> => {
  // 重试权限等同于写入权限
  return await authEvaluationItemWrite(evalItemId, auth);
};

// ================ 评估数据集(EvaluationDataset)专用权限验证函数 ================

/**
 * 验证评估数据集创建权限
 */
export const authEvaluationDatasetCreate = async (
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  // 评估数据集创建需要团队评估创建权限
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    per: TeamEvaluationCreatePermissionVal
  });

  return { teamId, tmbId };
};

/**
 * 验证评估数据集读取权限
 */
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

/**
 * 验证评估数据集写入权限
 */
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

/**
 * 验证从知识库生成评估数据集的权限
 */
export const authEvaluationDatasetGenFromKnowledgeBase = async (
  datasetId: string,
  kbCollectionIds: string[],
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  const { teamId, tmbId } = await authEvaluationDatasetRead(datasetId, auth);

  // 验证知识库的读权限
  await Promise.all(
    kbCollectionIds.map((collectionId) =>
      authDatasetCollection({
        ...auth,
        collectionId,
        per: ReadPermissionVal
      })
    )
  );

  return {
    teamId,
    tmbId
  };
};

// ================ 评估指标(EvaluationMetric)专用权限验证函数 ================

/**
 * 验证评估指标创建权限
 */
export const authEvaluationMetricCreate = async (
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  // 评估指标创建需要团队评估创建权限
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    per: TeamEvaluationCreatePermissionVal
  });

  return { teamId, tmbId };
};

/**
 * 验证评估指标读取权限
 */
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

/**
 * 验证评估指标写入权限
 */
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

// ================ 评估数据集数据(EvaluationDatasetData)专用权限验证函数 ================

/**
 * 验证评估数据集数据读取权限
 */
export const authEvaluationDatasetDataRead = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  // 数据读取需要数据集的读权限
  const { teamId, tmbId } = await authEvaluationDatasetRead(collectionId, auth);

  return { teamId, tmbId, collectionId };
};

/**
 * 验证评估数据集数据写入权限
 */
export const authEvaluationDatasetDataWrite = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  // 数据写入需要数据集的写权限
  const { teamId, tmbId } = await authEvaluationDatasetWrite(collectionId, auth);

  return { teamId, tmbId, collectionId };
};

/**
 * 验证评估数据集数据创建权限
 */
export const authEvaluationDatasetDataCreate = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  // 数据创建需要数据集的写权限
  return await authEvaluationDatasetDataWrite(collectionId, auth);
};

/**
 * 验证评估数据集数据删除权限
 */
export const authEvaluationDatasetDataDelete = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  // 数据删除需要数据集的写权限
  return await authEvaluationDatasetDataWrite(collectionId, auth);
};

/**
 * 验证评估数据集数据更新权限
 */
export const authEvaluationDatasetDataUpdate = async (
  collectionId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  // 数据更新需要数据集的写权限
  return await authEvaluationDatasetDataWrite(collectionId, auth);
};

/**
 * 通过数据项ID验证评估数据集数据更新权限
 */
export const authEvaluationDatasetDataUpdateById = async (
  dataId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  collectionId: string;
}> => {
  // 根据dataId获取collectionId
  const dataItem = await MongoEvalDatasetData.findById(dataId).select('datasetId').lean();
  if (!dataItem) {
    throw new Error('Dataset data not found');
  }

  // 使用collectionId进行权限验证
  const collectionId = String(dataItem.datasetId);
  return await authEvaluationDatasetDataUpdate(collectionId, auth);
};
