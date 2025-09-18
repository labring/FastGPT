import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import type {
  listEvalDatasetCollectionBody,
  listEvalDatasetCollectionResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import {
  getCollectionStatus,
  buildCollectionAggregationPipeline,
  formatCollectionBase,
  buildEvalDatasetCollectionFilter
} from '@fastgpt/service/core/evaluation/dataset/utils';

/*
  Get evaluation dataset list permissions - based on app list implementation
  1. Validate user permissions, get team permissions (owner handled separately)
  2. Get all evaluation dataset permissions under team, get all my groups, and calculate all my permissions
  3. Filter datasets I have permissions for, as well as datasets I created myself
  4. Get dataset list based on filter conditions
  5. Traverse searched datasets and assign permissions
  6. Filter again based on read permissions
*/
async function handler(
  req: ApiRequestProps<listEvalDatasetCollectionBody, {}>
): Promise<listEvalDatasetCollectionResponse> {
  const { offset, pageSize } = parsePaginationRequest(req);
  const { searchKey } = req.body;

  // Use shared filter logic
  const { finalFilter, teamId, tmbId, isOwner, myRoles, roleList } =
    await buildEvalDatasetCollectionFilter(req, searchKey);

  const [collections, total] = await Promise.all([
    MongoEvalDatasetCollection.aggregate([
      { $match: finalFilter },
      { $sort: { createTime: -1 as const } },
      { $skip: offset },
      { $limit: pageSize },
      ...buildCollectionAggregationPipeline({ tmbId: 1 })
    ]),
    MongoEvalDatasetCollection.countDocuments(finalFilter)
  ]);

  const formatCollections = collections
    .map((collection) => {
      const getPer = (collectionId: string) => {
        const tmbRole = myRoles.find(
          (item) => String(item.resourceId) === collectionId && !!item.tmbId
        )?.permission;
        const groupRole = sumPer(
          ...myRoles
            .filter(
              (item) => String(item.resourceId) === collectionId && (!!item.groupId || !!item.orgId)
            )
            .map((item) => item.permission)
        );
        const permission = new EvaluationPermission({
          role: tmbRole ?? groupRole,
          isOwner: String(collection.tmbId) === String(tmbId) || isOwner
        });

        return permission;
      };

      const getClbCount = (collectionId: string) => {
        return roleList.filter((item) => String(item.resourceId) === String(collectionId)).length;
      };

      const getPrivateStatus = (collectionId: string) => {
        const collaboratorCount = getClbCount(collectionId);
        if (isOwner) {
          return collaboratorCount <= 1;
        }
        return (
          collaboratorCount === 0 ||
          (collaboratorCount === 1 && String(collection.tmbId) === String(tmbId))
        );
      };

      return {
        ...formatCollectionBase(collection),
        tmbId: collection.tmbId,
        permission: getPer(String(collection._id)),
        private: getPrivateStatus(String(collection._id))
      };
    })
    .filter((collection) => {
      // Owner should have access to all collections
      if (isOwner) {
        return true;
      }
      return collection.permission.hasReadPer;
    });

  // Add status and source member info
  const collectionsWithStatus = await Promise.all(
    formatCollections.map(async (collection) => {
      const status = await getCollectionStatus(String(collection._id));
      return {
        ...collection,
        status
      };
    })
  );

  const collectionsWithMember = await addSourceMember({
    list: collectionsWithStatus
  });

  // Remove tmbId from final response as it's not needed in the API response
  const finalCollections = collectionsWithMember.map(({ tmbId, ...rest }) => rest);

  return {
    list: finalCollections,
    total: total
  };
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
