import type { EvalDatasetCollectionStatus } from '@fastgpt/global/core/evaluation/dataset/type';
import { EvalDatasetCollectionStatusEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { evalDatasetDataSynthesizeQueue } from './dataSynthesizeMq';
import { getEvaluationPermissionAggregation } from '../common';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { Types } from 'mongoose';
import type { ApiRequestProps } from '../../../type/next';

export async function getCollectionStatus(
  collectionId: string
): Promise<EvalDatasetCollectionStatus> {
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

export function buildCollectionAggregationPipeline(baseFields?: Record<string, any>) {
  return [
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
        foreignField: 'evalDatasetCollectionId',
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
        evaluationModel: 1,
        createTime: 1,
        updateTime: 1,
        creatorAvatar: '$teamMember.avatar',
        creatorName: '$teamMember.name',
        dataItemsCount: 1,
        ...baseFields
      }
    }
  ];
}

export function formatCollectionBase(collection: any) {
  return {
    _id: String(collection._id),
    name: collection.name,
    description: collection.description || '',
    evaluationModel: collection.evaluationModel,
    createTime: collection.createTime,
    updateTime: collection.updateTime,
    creatorAvatar: collection.creatorAvatar,
    creatorName: collection.creatorName,
    dataItemsCount: collection.dataItemsCount
  };
}

export async function buildEvalDatasetCollectionFilter(
  req: ApiRequestProps<{ searchKey?: string }>,
  searchKey?: string
) {
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

  return {
    finalFilter,
    teamId,
    tmbId,
    isOwner,
    myRoles,
    accessibleIds,
    roleList
  };
}
