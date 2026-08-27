import type { ClientSession } from '../../common/mongo';
import type { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getGroupsByTmbId } from './memberGroup/controllers';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getOrgIdSetWithParentByTmbId } from './org/controllers';
import { getCollaboratorId, sumPer } from '@fastgpt/global/support/permission/utils';
import { type SyncChildrenPermissionResourceType } from './inheritPermission';
import { resourcePermissionRepo } from './repository/resourcePermissionRepo';
import { createResourcePermissions } from './resourcePermissionService';
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
    await resourcePermissionRepo.findOne({
      resourceType: resourceType as PerResourceTypeEnum,
      teamId,
      resourceId,
      collaborator: { tmbId }
    })
  )?.permission;

  // could be 0
  if (tmbPer !== undefined) {
    return tmbPer;
  }

  // If there is no personal permission, get the group permission
  const [groups, orgIds] = await Promise.all([
    getGroupsByTmbId({ tmbId, teamId }),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId })
  ]);
  const permissions = await resourcePermissionRepo.findByCollaborators({
    resourceType: resourceType as PerResourceTypeEnum,
    teamId,
    resourceId,
    collaborators: [
      ...groups.map((group) => ({ groupId: String(group._id) })),
      ...Array.from(orgIds).map((orgId) => ({ orgId: String(orgId) }))
    ]
  });

  return sumPer(...permissions.map((item) => item.permission));
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
  return resourcePermissionRepo.findByResource({
    resourceId: resourceId == null || resourceId === '' ? undefined : String(resourceId),
    resourceType: resourceType as PerResourceTypeEnum,
    teamId,
    session
  });
}

/** 批量读取同一团队、同一资源类型下多个资源的直属 ACL。 */
export async function getResourceOwnedClbsByResourceIds({
  resourceType,
  teamId,
  resourceIds,
  session
}: {
  teamId: string;
  resourceIds: string[];
  resourceType: Omit<PerResourceTypeEnum, 'team'>;
  session?: ClientSession;
}) {
  if (resourceIds.length === 0) return [];

  return resourcePermissionRepo.findByResourceIds({
    resourceType: resourceType as PerResourceTypeEnum,
    teamId,
    resourceIds,
    session
  });
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
      tmbIds.length > 0
        ? MongoTeamMember.find({ _id: { $in: tmbIds }, teamId }, '_id name avatar').lean()
        : [],
      orgIds.length > 0
        ? MongoOrgModel.find({ _id: { $in: orgIds }, teamId }, '_id name avatar').lean()
        : [],
      groupIds.length > 0
        ? MongoMemberGroupModel.find({ _id: { $in: groupIds }, teamId }, '_id name avatar').lean()
        : []
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
  await createResourcePermissions({ resource, resourceType, session, tmbId });
};
