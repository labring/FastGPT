import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import {
  UpdateTrainingDataBodySchema,
  UpdateTrainingDataResponseSchema,
  type UpdateTrainingDataResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetAuditEventEnum } from '@fastgpt/global/core/dataset/audit/constants/event';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import {
  buildCollectionAuditResource,
  buildDatasetAuditResource
} from '@fastgpt/global/support/user/audit/type';
import { normalizeDatasetDataImages } from '@fastgpt/service/core/dataset/data/inlineImages/service';
import {
  findDocumentTrainingTask,
  retryDatasetDocumentTrainingWork,
  retryDocumentTrainingWork
} from '@/service/core/dataset/training/documentActions';
import { getDatasetTrainingWriteScope } from '@/service/core/dataset/training/errorScope';

/** 重试训练任务；首次训练允许编辑正文，rebuild 只重试已存索引。 */
async function handler(req: ApiRequestProps): Promise<UpdateTrainingDataResponse> {
  const body = parseApiInput({ req, bodySchema: UpdateTrainingDataBodySchema }).body;

  // 不传 dataId 时是批量重试：collectionId 和 datasetId 分别限定不同的重试范围。
  if (!body.dataId) {
    const { retryMatch, retryTeamId, tmbId, datasetName, collectionName, auditResource } =
      await (async () => {
        if (body.collectionId) {
          const { collection, teamId, tmbId } = await authDatasetCollection({
            req,
            authToken: true,
            authApiKey: true,
            collectionId: body.collectionId,
            per: WritePermissionVal
          });

          return {
            retryMatch: {
              teamId: collection.teamId,
              datasetId: collection.datasetId,
              collectionId: collection._id
            },
            retryTeamId: String(teamId),
            tmbId,
            datasetName: collection.dataset.name,
            collectionName: collection.name as string | undefined,
            auditResource: buildCollectionAuditResource(collection)
          };
        }

        const auth = await authDataset({
          req,
          authToken: true,
          authApiKey: true,
          datasetId: body.datasetId!,
          per: WritePermissionVal
        });
        const { teamId, tmbId, dataset } = auth;
        const writeScope = await getDatasetTrainingWriteScope(auth);

        return {
          retryMatch: {
            teamId: writeScope.teamId,
            datasetId: writeScope.datasetId,
            collectionIds: writeScope.collectionIds
          },
          retryTeamId: String(teamId),
          tmbId,
          datasetName: dataset.name,
          collectionName: undefined,
          auditResource: buildDatasetAuditResource(dataset)
        };
      })();

    if (retryMatch.collectionId) {
      await retryDocumentTrainingWork({
        scope: {
          teamId: String(retryMatch.teamId),
          datasetId: String(retryMatch.datasetId),
          collectionId: String(retryMatch.collectionId)
        }
      });
    } else {
      await retryDatasetDocumentTrainingWork({
        teamId: String(retryMatch.teamId),
        datasetId: String(retryMatch.datasetId),
        collectionIds: retryMatch.collectionIds
      });
    }

    // 审计只记录已发起的重试操作，不统计实际命中条数（需改造重试函数返回值，超出审计范围）。
    // 重试粒度由请求参数决定：带 collectionId 是集合级，否则是知识库级。
    if (body.collectionId) {
      addAuditLog({
        tmbId,
        teamId: retryTeamId,
        event: DatasetAuditEventEnum.DATASET_COLLECTION_TRAINING_RETRY,
        resources: [auditResource],
        params: {
          datasetName,
          collectionName: collectionName!
        }
      });
    } else {
      addAuditLog({
        tmbId,
        teamId: retryTeamId,
        event: DatasetAuditEventEnum.DATASET_TRAINING_RETRY,
        resources: [auditResource],
        params: {
          datasetName
        }
      });
    }

    return UpdateTrainingDataResponseSchema.parse(undefined);
  }

  const { q, a, chunkIndex } = body;
  // 单条重试只信任 dataId 找到的训练记录，再用记录所属 collection 做权限校验。
  const data = await findDocumentTrainingTask(body.dataId);

  if (!data) {
    return Promise.reject('data not found');
  }

  const { collection, tmbId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: data.collectionId,
    per: WritePermissionVal
  });

  if (
    String(collection.teamId) !== String(data.teamId) ||
    String(collection.datasetId) !== String(data.datasetId) ||
    String(collection._id) !== String(data.collectionId)
  ) {
    return Promise.reject('data not found');
  }

  if (
    [TrainingModeEnum.rebuildIndex, TrainingModeEnum.rebuildSynonym].includes(data.mode) &&
    (q !== undefined || a !== undefined || chunkIndex !== undefined)
  ) {
    return Promise.reject('重建任务不支持编辑正文');
  }

  // 只转存本次提交字段；未提交的已有字段通过 existingContent 仅参与受管内联图计数，避免误上传或拒绝历史 Base64。
  const normalized: { data: Array<{ q?: string; a?: string }>; imageUploadKeys: string[] } =
    q !== undefined || a !== undefined
      ? await normalizeDatasetDataImages({
          teamId: String(collection.teamId),
          datasetId: String(collection.datasetId),
          collectionId: String(collection._id),
          data: [{ ...(q !== undefined && { q }), ...(a !== undefined && { a }) }],
          existingContent: [
            { ...(q === undefined && { q: data.q }), ...(a === undefined && { a: data.a }) }
          ]
        })
      : { data: [{}], imageUploadKeys: [] };
  const submittedFields = normalized.data[0];

  await retryDocumentTrainingWork({
    scope: {
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionId: collection._id
    },
    taskId: String(data._id),
    edit: {
      ...submittedFields,
      ...(chunkIndex !== undefined && { chunkIndex })
    },
    imageUploadKeys: normalized.imageUploadKeys
  });

  // 单条重试写入独立事件：它只影响一个分块，与批量重试分开统计。
  addAuditLog({
    tmbId,
    teamId: String(collection.teamId),
    event: DatasetAuditEventEnum.DATASET_TRAINING_TASK_RETRY,
    resources: [buildCollectionAuditResource(collection)],
    params: {
      datasetName: collection.dataset?.name ?? '',
      collectionName: collection.name
    }
  });

  return UpdateTrainingDataResponseSchema.parse(undefined);
}

export default NextAPI(handler);

export { handler };
