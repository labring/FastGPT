import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  listEvalDatasetCollectionBody,
  listEvalDatasetCollectionResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import type { EvalDatasetCollectionStatus } from '@fastgpt/global/core/evaluation/dataset/type';
import { EvalDatasetCollectionStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { evalDatasetDataSynthesizeQueue } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';

async function getCollectionStatus(collectionId: string): Promise<EvalDatasetCollectionStatus> {
  try {
    const jobs = await evalDatasetDataSynthesizeQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed'
    ]);
    const collectionJobs = jobs.filter((job) => job.data.evalDatasetCollectionId === collectionId);

    if (collectionJobs.length === 0) {
      return EvalDatasetCollectionStatusEnum.ready;
    }

    if (collectionJobs.some((job) => job.isFailed())) {
      return EvalDatasetCollectionStatusEnum.error;
    }

    if (collectionJobs.some((job) => job.isActive())) {
      return EvalDatasetCollectionStatusEnum.processing;
    }

    if (collectionJobs.some((job) => job.isWaiting() || job.isDelayed())) {
      return EvalDatasetCollectionStatusEnum.queuing;
    }

    return EvalDatasetCollectionStatusEnum.ready;
  } catch (error) {
    console.error('Error getting collection status:', error);
    return EvalDatasetCollectionStatusEnum.ready;
  }
}

async function handler(
  req: ApiRequestProps<listEvalDatasetCollectionBody, {}>
): Promise<listEvalDatasetCollectionResponse> {
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const { offset, pageSize } = parsePaginationRequest(req);
  const { searchKey } = req.body;

  const match: Record<string, any> = {
    teamId: new Types.ObjectId(teamId)
  };

  // Add search filter if provided
  if (searchKey && typeof searchKey === 'string' && searchKey.trim().length > 0) {
    match.name = { $regex: new RegExp(`${replaceRegChars(searchKey.trim())}`, 'i') };
  }

  try {
    // Execute aggregation with pagination
    const [collections, total] = await Promise.all([
      MongoEvalDatasetCollection.aggregate(buildPipeline(match, offset, pageSize)),
      MongoEvalDatasetCollection.countDocuments(match)
    ]);

    // TODO: Audit Log - Log successful response

    const collectionsWithStatus = await Promise.all(
      collections.map(async (item) => {
        const status = await getCollectionStatus(String(item._id));
        return {
          _id: String(item._id),
          name: item.name,
          description: item.description || '',
          createTime: item.createTime,
          updateTime: item.updateTime,
          creatorAvatar: item.teamMember?.avatar,
          creatorName: item.teamMember?.name,
          status
        };
      })
    );

    return {
      total,
      list: collectionsWithStatus
    };
  } catch (error) {
    console.error('Database error in eval dataset collection list:', error);
    throw error;
  }
}

const buildPipeline = (match: Record<string, any>, offset: number, pageSize: number) => [
  { $match: match },
  { $sort: { createTime: -1 as const } },
  { $skip: offset },
  { $limit: pageSize },
  {
    $lookup: {
      from: 'team_members',
      localField: 'tmbId',
      foreignField: '_id',
      as: 'teamMember'
    }
  },
  {
    $addFields: {
      teamMember: { $arrayElemAt: ['$teamMember', 0] }
    }
  },
  {
    $project: {
      _id: 1,
      name: 1,
      description: 1,
      createTime: 1,
      updateTime: 1,
      teamMember: {
        avatar: 1,
        name: 1
      }
    }
  }
];

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
