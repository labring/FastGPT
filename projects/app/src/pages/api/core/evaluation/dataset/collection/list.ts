import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { Types } from 'mongoose';
import type {
  listEvalDatasetCollectionBody,
  listEvalDatasetCollectionResponse
} from '@fastgpt/global/core/evaluation/dataset/api';
import type { EvalDatasetCollectionStatus } from '@fastgpt/global/core/evaluation/dataset/type';
import { EvalDatasetCollectionStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { evalDatasetDataSynthesizeQueue } from '@fastgpt/service/core/evaluation/dataset/dataSynthesizeMq';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { getEvaluationPermissionAggregation } from '@fastgpt/service/core/evaluation/common';

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

  // API layer permission validation: get permission aggregation info
  const { teamId, tmbId, isOwner, roleList, myGroupMap, myOrgSet } =
    await getEvaluationPermissionAggregation({
      req,
      authApiKey: true,
      authToken: true
    });

  // Calculate resource IDs accessible by user
  const myRoles = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );
  const accessibleIds = myRoles.map((item) => String(item.resourceId));

  // Build unified filter conditions
  const baseFilter: Record<string, any> = {
    teamId: new Types.ObjectId(teamId)
  };

  if (searchKey && typeof searchKey === 'string' && searchKey.trim().length > 0) {
    baseFilter.name = { $regex: new RegExp(`${replaceRegChars(searchKey.trim())}`, 'i') };
  }

  // Unified permission filtering logic
  let finalFilter = baseFilter;
  if (!isOwner) {
    if (accessibleIds.length > 0) {
      finalFilter = {
        ...baseFilter,
        $or: [
          { _id: { $in: accessibleIds.map((id) => new Types.ObjectId(id)) } },
          { tmbId: new Types.ObjectId(tmbId) } // Own datasets
        ]
      };
    } else {
      // If no permission roles, can only access self-created datasets
      finalFilter = {
        ...baseFilter,
        tmbId: new Types.ObjectId(tmbId)
      };
    }
  }

  const [collections, total] = await Promise.all([
    MongoEvalDatasetCollection.aggregate([
      { $match: finalFilter },
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
        $lookup: {
          from: 'eval_dataset_datas',
          localField: '_id',
          foreignField: 'datasetId',
          as: 'dataItems'
        }
      },
      {
        $addFields: {
          teamMember: { $arrayElemAt: ['$teamMember', 0] },
          dataItemsCount: { $size: '$dataItems' }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          tmbId: 1,
          createTime: 1,
          updateTime: 1,
          creatorAvatar: '$teamMember.avatar',
          creatorName: '$teamMember.name',
          dataItemsCount: 1
        }
      }
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
        _id: String(collection._id),
        name: collection.name,
        description: collection.description || '',
        tmbId: collection.tmbId,
        createTime: collection.createTime,
        updateTime: collection.updateTime,
        creatorAvatar: collection.creatorAvatar,
        creatorName: collection.creatorName,
        permission: getPer(String(collection._id)),
        private: getPrivateStatus(String(collection._id)),
        dataItemsCount: collection.dataItemsCount
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
