import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import type {
  listEvalDatasetCollectionV2Body,
  listEvalDatasetCollectionV2Response
} from '@fastgpt/global/core/evaluation/dataset/api';
import { buildEvalDatasetCollectionFilter } from '@fastgpt/service/core/evaluation/dataset/utils';

/*
  Get evaluation dataset collection list - lightweight version
  Returns only essential data: _id, name, createTime
  Features:
  - Optional pagination (returns all when no pagination params)
  - Fast performance (no heavy operations)
  - Reuses filter logic from v1
*/
async function handler(
  req: ApiRequestProps<listEvalDatasetCollectionV2Body, {}>
): Promise<listEvalDatasetCollectionV2Response> {
  const { searchKey, pageSize, pageNum, offset } = req.body;

  // Reuse shared filter logic
  const { finalFilter } = await buildEvalDatasetCollectionFilter(req, searchKey);

  // Build lightweight aggregation pipeline
  const pipeline: any[] = [
    { $match: finalFilter },
    { $sort: { createTime: -1 as const } },
    {
      $project: {
        _id: 1,
        name: 1,
        createTime: 1
      }
    }
  ];

  // Add pagination only if provided
  if (pageSize && (pageNum !== undefined || offset !== undefined)) {
    const calculatedOffset =
      offset !== undefined ? Number(offset) : (Number(pageNum) - 1) * Number(pageSize);
    pipeline.push({ $skip: calculatedOffset }, { $limit: Number(pageSize) });
  }

  // Execute aggregation and count in parallel
  const [collections, total] = await Promise.all([
    MongoEvalDatasetCollection.aggregate(pipeline),
    MongoEvalDatasetCollection.countDocuments(finalFilter)
  ]);

  // Format response
  const formattedCollections = collections.map((collection) => ({
    _id: String(collection._id),
    name: collection.name,
    createTime: collection.createTime
  }));

  return {
    list: formattedCollections,
    total: total
  };
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
