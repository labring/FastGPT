import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/evalDatasetDataSchema';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { Types } from '@fastgpt/service/common/mongo';
import type {
  listEvalDatasetDataBody,
  listEvalDatasetDataResponse
} from '@fastgpt/global/core/evaluation/api';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';

async function handler(
  req: ApiRequestProps<listEvalDatasetDataBody, {}>
): Promise<listEvalDatasetDataResponse> {
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  // Parse request parameters
  const { offset, pageSize } = parsePaginationRequest(req);
  const { collectionId, searchKey } = req.body;

  // Validate required parameters
  if (!collectionId) {
    throw new Error('Collection ID is required');
  }

  // TODO: Audit Log - Log request attempt with parameters
  console.log(`[AUDIT] User requested eval dataset data list for collection: ${collectionId}`);

  // Verify collection exists and belongs to team
  const collection = await MongoEvalDatasetCollection.findOne({
    _id: new Types.ObjectId(collectionId),
    teamId: new Types.ObjectId(teamId)
  });

  if (!collection) {
    throw new Error('Collection not found or access denied');
  }

  // Build MongoDB match criteria
  const match: Record<string, any> = {
    datasetId: new Types.ObjectId(collectionId)
  };

  // Add search filter if provided
  if (searchKey && typeof searchKey === 'string' && searchKey.trim().length > 0) {
    const searchRegex = new RegExp(`${replaceRegChars(searchKey.trim())}`, 'i');
    match.$or = [
      { user_input: { $regex: searchRegex } },
      { expected_output: { $regex: searchRegex } },
      { actual_output: { $regex: searchRegex } }
    ];
  }

  try {
    // TODO: Performance Tracking - Log query execution time
    const startTime = Date.now();

    // Execute aggregation with pagination
    const [dataList, total] = await Promise.all([
      MongoEvalDatasetData.aggregate(buildPipeline(match, offset, pageSize)),
      MongoEvalDatasetData.countDocuments(match)
    ]);

    // TODO: Performance Tracking - Log query completion time
    const executionTime = Date.now() - startTime;
    console.log(`[PERFORMANCE] Query executed in ${executionTime}ms`);

    // TODO: Audit Log - Log successful response
    console.log(`[AUDIT] Successfully returned ${dataList.length} items out of ${total} total`);

    return {
      total,
      list: dataList.map((item) => ({
        _id: String(item._id),
        user_input: item.user_input,
        actual_output: item.actual_output || '',
        expected_output: item.expected_output,
        context: item.context || [],
        retrieval_context: item.retrieval_context || [],
        metadata: item.metadata || {},
        createFrom: item.createFrom,
        createTime: item.createTime,
        updateTime: item.updateTime
      }))
    };
  } catch (error) {
    // TODO: Error Tracking - Log detailed error information
    console.error('[ERROR] Database error in eval dataset data list:', error);

    // TODO: Audit Log - Log failed request
    console.log(
      `[AUDIT] Failed to retrieve eval dataset data list for collection: ${collectionId}`
    );

    throw error;
  }
}

/**
 * Build MongoDB aggregation pipeline
 */
const buildPipeline = (match: Record<string, any>, offset: number, pageSize: number) => [
  { $match: match },
  { $sort: { createTime: -1 as const } },
  { $skip: offset },
  { $limit: pageSize },
  {
    $project: {
      _id: 1,
      user_input: 1,
      actual_output: 1,
      expected_output: 1,
      context: 1,
      retrieval_context: 1,
      metadata: 1,
      createFrom: 1,
      createTime: 1,
      updateTime: 1
    }
  }
];

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
