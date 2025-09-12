import type { ClientSession, AnyBulkWriteOperation } from '../../common/mongo';
import type { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ManageRoleVal, OwnerRoleVal } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from './schema';
import type { ResourcePermissionType, ResourceType } from '@fastgpt/global/support/permission/type';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getGroupsByTmbId } from './memberGroup/controllers';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getOrgIdSetWithParentByTmbId } from './org/controllers';
import { getCollaboratorId, sumPer } from '@fastgpt/global/support/permission/utils';
import { type SyncChildrenPermissionResourceType } from './inheritPermission';
import { pickCollaboratorIdFields } from './utils';
import type {
  CollaboratorItemDetailType,
  CollaboratorItemType
} from '@fastgpt/global/support/permission/collaborator';
import { MongoTeamMember } from '../../support/user/team/teamMemberSchema';
import { MongoOrgModel } from './org/orgSchema';
import { MongoMemberGroupModel } from './memberGroup/memberGroupSchema';
import { DEFAULT_ORG_AVATAR, DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';

/** get resource permission for a team member
 * If there is no permission for the team member, it will return undefined
 * @param resourceType: PerResourceTypeEnum
 * @param teamId
 * @param tmbId
 * @param resourceId
 * @returns PermissionValueType | undefined
 */
export const getTmbPermission = async ({
  resourceType,
  teamId,
  tmbId,
  resourceId
}: {
  teamId: string;
  tmbId: string;
} & (
  | {
      resourceType: 'team';
      resourceId?: undefined;
    }
  | {
      resourceType: Omit<PerResourceTypeEnum, 'team'>;
      resourceId: string;
    }
)): Promise<PermissionValueType | undefined> => {
  // Personal permission has the highest priority
  const tmbPer = (
    await MongoResourcePermission.findOne(
      {
        resourceType,
        teamId,
        resourceId,
        tmbId
      },
      'permission'
    ).lean()
  )?.permission;

  // could be 0
  if (tmbPer !== undefined) {
    return tmbPer;
  }

  // If there is no personal permission, get the group permission
  const [groupPers, orgPers] = await Promise.all([
    getGroupsByTmbId({ tmbId, teamId })
      .then((res) => res.map((item) => item._id))
      .then((groupIdList) =>
        MongoResourcePermission.find(
          {
            teamId,
            resourceType,
            groupId: {
              $in: groupIdList
            },
            resourceId
          },
          'permission'
        ).lean()
      )
      .then((perList) => perList.map((item) => item.permission)),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId })
      .then((item) => Array.from(item))
      .then((orgIds) =>
        MongoResourcePermission.find(
          {
            teamId,
            resourceType,
            orgId: {
              $in: Array.from(orgIds)
            },
            resourceId
          },
          'permission'
        ).lean()
      )
      .then((perList) => perList.map((item) => item.permission))
  ]);

  return sumPer(...groupPers, ...orgPers);
};

/**
 * Only get resource's owned clbs, not including parents'.
 */
export async function getResourceOwnedClbs({
  resourceType,
  teamId,
  resourceId,
  session
}: {
  teamId: string;
  session?: ClientSession;
} & (
  | {
      resourceType: 'team';
      resourceId?: undefined;
    }
  | {
      resourceType: Omit<PerResourceTypeEnum, 'team'>;
      resourceId: ParentIdType;
    }
)) {
  return MongoResourcePermission.find(
    {
      resourceId,
      resourceType,
      teamId
    },
    undefined,
    { ...(session ? { session } : {}) }
  ).lean();
}

export const getClbsInfo = async ({
  clbs,
  teamId,
  ownerTmbId
}: {
  clbs: CollaboratorItemType[];
  teamId: string;
  ownerTmbId?: string;
}): Promise<CollaboratorItemDetailType[]> => {
  const tmbIds = [];
  const orgIds = [];
  const groupIds = [];

  for (const clb of clbs) {
    if (clb.tmbId) tmbIds.push(clb.tmbId);
    if (clb.orgId) orgIds.push(clb.orgId);
    if (clb.groupId) groupIds.push(clb.groupId);
  }

  const infos = (
    await Promise.all([
      MongoTeamMember.find({ _id: { $in: tmbIds }, teamId }, '_id name avatar').lean(),
      MongoOrgModel.find({ _id: { $in: orgIds }, teamId }, '_id name avatar').lean(),
      MongoMemberGroupModel.find({ _id: { $in: groupIds }, teamId }, '_id name avatar').lean()
    ])
  ).flat();

  return clbs.map((clb) => {
    const info = infos.find((info) => info._id === getCollaboratorId(clb));

    return {
      ...clb,
      teamId,
      permission: new Permission({
        role: clb.permission,
        isOwner: Boolean(ownerTmbId && clb.tmbId && ownerTmbId === clb.tmbId)
      }),
      name: info?.name ?? 'Unknown name',
      avatar: info?.avatar || (clb.orgId ? DEFAULT_ORG_AVATAR : DEFAULT_TEAM_AVATAR)
    };
  });
};

export const createResourceDefaultCollaborators = async ({
  resource,
  resourceType,
  session,
  tmbId
}: {
  resource: SyncChildrenPermissionResourceType;
  resourceType: PerResourceTypeEnum;

  // should be provided when inheritPermission is true
  session: ClientSession;
  tmbId: string;
}) => {
  const parentClbs = await getResourceOwnedClbs({
    resourceId: resource.parentId,
    resourceType,
    teamId: resource.teamId,
    session
  });
  // 1. add owner into the permission list with owner per
  // 2. remove parent's owner permission, instead of manager

  const collaborators: CollaboratorItemType[] = [
    ...parentClbs
      .filter((item) => item.tmbId !== tmbId)
      .map((clb) => {
        if (clb.permission === OwnerRoleVal) {
          clb.permission = ManageRoleVal;
        }
        return clb;
      }),
    {
      tmbId,
      permission: OwnerRoleVal
    }
  ];

  const ops: AnyBulkWriteOperation<ResourcePermissionType>[] = [];

  for (const clb of collaborators) {
    ops.push({
      updateOne: {
        filter: {
          ...pickCollaboratorIdFields(clb),
          teamId: resource.teamId,
          resourceId: resource._id,
          resourceType
        },
        update: {
          $set: {
            permission: clb.permission
          }
        },
        upsert: true
      }
    });
  }

  await MongoResourcePermission.bulkWrite(ops, { session });
};
