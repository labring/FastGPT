import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  listEvalDatasetCollectionBody,
  listEvalDatasetCollectionResponse
} from '@fastgpt/global/core/evaluation/api';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

async function handler(
  req: ApiRequestProps<listEvalDatasetCollectionBody, {}>
): Promise<listEvalDatasetCollectionResponse> {
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  // Parse request parameters
  const { offset, pageSize } = parsePaginationRequest(req);
  const { searchKey } = req.body;

  // Build MongoDB pipeline
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

    return {
      total,
      list: collections.map((item) => ({
        _id: String(item._id),
        name: item.name,
        description: item.description || '',
        createTime: item.createTime,
        updateTime: item.updateTime,
        dataCountByGen: item.dataCountByGen || 0,
        creatorAvatar: item.teamMember?.avatar,
        creatorName: item.teamMember?.name
      }))
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
      dataCountByGen: 1,
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
