import type { ClientSession, AnyBulkWriteOperation } from '../../common/mongo';
import type { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import {
  ManageRoleVal,
  NullRoleVal,
  OwnerRoleVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from './schema';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getGroupsByTmbId } from './memberGroup/controllers';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { type MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
import { type TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import { type OrgSchemaType } from '@fastgpt/global/support/user/team/org/type';
import { getOrgIdSetWithParentByTmbId } from './org/controllers';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { DEFAULT_ORG_AVATAR } from '@fastgpt/global/common/system/constants';
import { type SyncChildrenPermissionResourceType } from './inheritPermission';
import { pickCollaboratorIdFields } from './utils';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

/** get resource permission for a team member
 * If there is no permission for the team member, it will return undefined
 * @param resourceType: PerResourceTypeEnum
 * @param teamId
 * @param tmbId
 * @param resourceId
 * @returns PermissionValueType | undefined
 */
export const getResourcePermission = async ({
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

export async function getResourceClbs({
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

export const getClbsWithInfo = async ({
  resourceId,
  resourceType,
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId?: string;
} & (
  | {
      resourceId: ParentIdType;
      resourceType: Omit<`${PerResourceTypeEnum}`, 'team'>;
    }
  | {
      resourceType: 'team';
      resourceId?: undefined;
    }
)) => {
  if (!resourceId && resourceType !== 'team') {
    return [];
  }
  return Promise.all([
    ...(
      await MongoResourcePermission.find({
        teamId,
        resourceId,
        resourceType,
        tmbId: {
          $exists: true
        }
      })
        .populate<{ tmb: TeamMemberSchema }>({
          path: 'tmb',
          select: 'name userId avatar'
        })
        .lean()
    )
      .map((item) => ({
        tmbId: item.tmb._id,
        teamId: item.teamId,
        permission: new Permission({ role: item.permission, isOwner: item.tmbId === tmbId }),
        name: item.tmb.name,
        avatar: item.tmb.avatar
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ...(
      await MongoResourcePermission.find({
        teamId,
        resourceId,
        resourceType,
        groupId: {
          $exists: true
        }
      })
        .populate<{ group: MemberGroupSchemaType }>('group', 'name avatar')
        .lean()
    ).map((item) => ({
      groupId: item.group._id,
      teamId: item.teamId,
      permission: new Permission({ role: item.permission }),
      name: item.group.name,
      avatar: item.group.avatar
    })),
    ...(
      await MongoResourcePermission.find({
        teamId,
        resourceId,
        resourceType,
        orgId: {
          $exists: true
        }
      })
        .populate<{ org: OrgSchemaType }>({ path: 'org', select: 'name avatar' })
        .lean()
    ).map((item) => ({
      orgId: item.org._id,
      teamId: item.teamId,
      permission: new Permission({ role: item.permission }),
      name: item.org.name,
      avatar: item.org.avatar || DEFAULT_ORG_AVATAR
    }))
  ]);
};

export const delResourcePermissionById = (id: string) => {
  return MongoResourcePermission.findByIdAndDelete(id);
};
export const delResourcePermission = ({
  session,
  tmbId,
  groupId,
  orgId,
  ...props
}: {
  resourceType: PerResourceTypeEnum;
  teamId: string;
  resourceId: string;
  session?: ClientSession;
  tmbId?: string;
  groupId?: string;
  orgId?: string;
}) => {
  // either tmbId or groupId or orgId must be provided
  if (!tmbId && !groupId && !orgId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  return MongoResourcePermission.deleteOne(
    {
      ...(tmbId ? { tmbId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(orgId ? { orgId } : {}),
      ...props
    },
    { session }
  );
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
  const parentClbs = await getResourceClbs({
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
          clb.selfPermission = NullRoleVal;
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
            permission: clb.permission,
            selfPermission: NullRoleVal
          }
        },
        upsert: true
      }
    });
  }

  await MongoResourcePermission.bulkWrite(ops, { session });
};
