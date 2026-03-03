/* Auth evaluation permission */
import { parseHeaderCert } from '../auth/common';
import { getTmbPermission } from '../controller';
import {
  OwnerPermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import type { EvaluationWithPerType } from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType, AuthResponseType } from '../type';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { MongoEvaluation } from '../../../core/evaluation/task';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { isS3ObjectKey } from '../../../common/s3/utils';

// ================ Authentication and Authorization for eval task ================
export const authEvaluationByTmbId = async ({
  tmbId,
  evaluationId,
  per,
  isRoot
}: {
  tmbId: string;
  evaluationId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{ evaluation: EvaluationWithPerType }> => {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const evaluation = await MongoEvaluation.findOne({ _id: evaluationId }).lean();
  if (!evaluation) {
    return Promise.reject(EvaluationErrEnum.evalTaskNotFound);
  }

  // Root用户权限特殊处理
  if (isRoot) {
    return {
      evaluation: {
        ...evaluation,
        permission: new EvaluationPermission({ isOwner: true })
      }
    };
  }

  // 团队权限验证
  if (String(evaluation.teamId) !== teamId) {
    return Promise.reject(EvaluationErrEnum.evalTaskNotFound);
  }

  // 所有者检查
  const isOwner = tmbPer.isOwner || String(evaluation.tmbId) === String(tmbId);

  // 权限计算
  const { Per } = await (async () => {
    if (isOwner) {
      return { Per: new EvaluationPermission({ isOwner: true }) };
    }

    // 获取评估资源的权限
    const role = await getTmbPermission({
      teamId,
      tmbId,
      resourceId: evaluationId,
      resourceType: PerResourceTypeEnum.evaluation
    });

    return { Per: new EvaluationPermission({ role, isOwner }) };
  })();

  // 权限验证
  if (!Per.checkPer(per)) {
    return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
  }

  return {
    evaluation: {
      ...evaluation,
      permission: Per
    }
  };
};

export const authEvaluation = async ({
  evaluationId,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  evaluationId: string;
  per?: PermissionValueType;
}): Promise<
  AuthResponseType & {
    evaluation: EvaluationWithPerType;
  }
> => {
  const result = await parseHeaderCert({
    ...props,
    authApiKey: true // 添加API Key支持
  });
  const { tmbId } = result;

  if (!evaluationId) {
    return Promise.reject(EvaluationErrEnum.evalTaskNotFound);
  }

  const { evaluation } = await authEvaluationByTmbId({
    tmbId,
    evaluationId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: evaluation.permission,
    evaluation
  };
};

// ================ Authentication and Authorization for eval dataset ================
export const authEvalDatasetByTmbId = async ({
  tmbId,
  datasetId,
  per,
  isRoot
}: {
  tmbId: string;
  datasetId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{ dataset: any }> => {
  const { MongoEvalDatasetCollection } = await import(
    '../../../core/evaluation/dataset/evalDatasetCollectionSchema'
  );
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const dataset = await MongoEvalDatasetCollection.findOne({ _id: datasetId }).lean();
  if (!dataset) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  // Root用户权限特殊处理
  if (isRoot) {
    return {
      dataset: {
        ...dataset,
        permission: new EvaluationPermission({ isOwner: true })
      }
    };
  }

  // 团队权限验证
  if (String(dataset.teamId) !== teamId) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  // 所有者检查
  const isOwner = tmbPer.isOwner || String(dataset.tmbId) === String(tmbId);

  // 权限计算 - 使用evaluation资源类型
  const { Per } = await (async () => {
    if (isOwner) {
      return { Per: new EvaluationPermission({ isOwner: true }) };
    }

    // 获取evaluation资源的权限（evalDataset复用evaluation权限）
    const role = await getTmbPermission({
      teamId,
      tmbId,
      resourceId: datasetId,
      resourceType: PerResourceTypeEnum.evaluation
    });

    return { Per: new EvaluationPermission({ role, isOwner }) };
  })();

  // 权限验证
  if (!Per.checkPer(per)) {
    return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
  }

  return {
    dataset: {
      ...dataset,
      permission: Per
    }
  };
};

export const authEvalDataset = async ({
  datasetId,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  datasetId: string;
  per?: PermissionValueType;
}): Promise<
  AuthResponseType & {
    dataset: any;
  }
> => {
  const result = await parseHeaderCert({
    ...props,
    authApiKey: true // 添加API Key支持
  });
  const { tmbId } = result;

  if (!datasetId) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  const { dataset } = await authEvalDatasetByTmbId({
    tmbId,
    datasetId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: dataset.permission,
    dataset
  };
};

export const authEvalDatasetCollectionFile = async ({
  fileId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  fileId: string;
}): Promise<AuthResponseType> => {
  const authRes = await parseHeaderCert(props);
  const { teamId } = authRes;

  if (!isS3ObjectKey(fileId, 'temp')) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  // temp key 格式: temp/{teamId}/{filename}，从路径提取 teamId 校验归属
  const keyTeamId = fileId.split('/')[1];
  if (keyTeamId !== teamId) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  const exists = await getS3DatasetSource().isObjectExists(fileId);
  if (!exists) {
    return Promise.reject(CommonErrEnum.fileNotFound);
  }

  const permission = new Permission({ role: ReadRoleVal, isOwner: true });

  if (!permission.checkPer(per)) {
    return Promise.reject(CommonErrEnum.unAuthFile);
  }

  return {
    ...authRes,
    permission
  };
};

// ================ Authentication and Authorization for eval metric ================
export const authEvalMetricByTmbId = async ({
  tmbId,
  metricId,
  per,
  isRoot
}: {
  tmbId: string;
  metricId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{ metric: any }> => {
  const { MongoEvalMetric } = await import('../../../core/evaluation/metric/schema');
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const metric = await MongoEvalMetric.findOne({ _id: metricId }).lean();
  if (!metric) {
    return Promise.reject(EvaluationErrEnum.evalMetricNotFound);
  }

  // Root用户权限特殊处理
  if (isRoot) {
    return {
      metric: {
        ...metric,
        permission: new EvaluationPermission({ isOwner: true })
      }
    };
  }

  // 团队权限验证 - 内置metric允许跨团队访问
  if (String(metric.teamId) !== teamId) {
    return Promise.reject(EvaluationErrEnum.evalMetricNotFound);
  }

  // 所有者检查
  const isOwner = tmbPer.isOwner || String(metric.tmbId) === String(tmbId);

  // 权限计算 - 使用evaluation资源类型
  const { Per } = await (async () => {
    if (isOwner) {
      return { Per: new EvaluationPermission({ isOwner: true }) };
    }

    // 获取evaluation资源的权限（evalMetric复用evaluation权限）
    const role = await getTmbPermission({
      teamId,
      tmbId,
      resourceId: metricId,
      resourceType: PerResourceTypeEnum.evaluation
    });

    return { Per: new EvaluationPermission({ role, isOwner }) };
  })();

  // 权限验证
  if (!Per.checkPer(per)) {
    return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
  }

  return {
    metric: {
      ...metric,
      permission: Per
    }
  };
};

export const authEvalMetric = async ({
  metricId,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  metricId: string;
  per?: PermissionValueType;
}): Promise<
  AuthResponseType & {
    metric: any;
  }
> => {
  const result = await parseHeaderCert({
    ...props,
    authApiKey: true // 添加API Key支持
  });
  const { tmbId } = result;

  if (!metricId) {
    return Promise.reject(EvaluationErrEnum.evalMetricNotFound);
  }

  const { metric } = await authEvalMetricByTmbId({
    tmbId,
    metricId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: metric.permission,
    metric
  };
};
