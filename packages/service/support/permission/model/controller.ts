import {
  NullRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../org/controllers';
import { MongoResourcePermission } from '../schema';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import type { SystemModelItemType } from '../../../core/ai/type';
import { getTmbPermission } from '../controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';

const getModelCollaboratorRoleMap = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}) => {
  const [groups, orgIdSet, rps] = await Promise.all([
    getGroupsByTmbId({
      teamId,
      tmbId
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    }),
    MongoResourcePermission.find({
      teamId,
      resourceType: PerResourceTypeEnum.model
    }).lean()
  ]);

  const groupIdSet = new Set(groups.map((g) => String(g._id)));
  const tmbRoleMap = new Map<string, PermissionValueType>();
  const groupAndOrgRoleMap = new Map<string, PermissionValueType[]>();

  for (const rp of rps) {
    const resourceId = String(rp.resourceId);
    if (rp.tmbId && String(rp.tmbId) === String(tmbId)) {
      tmbRoleMap.set(resourceId, rp.permission);
      continue;
    }
    if (
      (rp.groupId && groupIdSet.has(String(rp.groupId))) ||
      (rp.orgId && orgIdSet.has(String(rp.orgId)))
    ) {
      const roles = groupAndOrgRoleMap.get(resourceId) ?? [];
      roles.push(rp.permission);
      groupAndOrgRoleMap.set(resourceId, roles);
    }
  }

  const permissionMap = new Map<string, PermissionValueType>();

  groupAndOrgRoleMap.forEach((roles, resourceId) => {
    permissionMap.set(resourceId, sumPer(...roles) ?? NullRoleVal);
  });
  tmbRoleMap.forEach((role, resourceId) => {
    permissionMap.set(resourceId, role);
  });

  return permissionMap;
};

const getModelPermissionFromRole = ({
  model,
  teamId,
  tmbId,
  teamPer,
  isRoot,
  collaboratorRole
}: {
  model: SystemModelItemType;
  teamId: string;
  tmbId: string;
  teamPer?: { isOwner: boolean };
  isRoot?: boolean;
  collaboratorRole?: PermissionValueType;
}) => {
  if (isRoot) {
    return new ModelPermission({ isOwner: true });
  }

  if (!model.isCustom) {
    return new ModelPermission({
      role: model.isShared ? ReadRoleVal : NullRoleVal
    });
  }

  const isOwner =
    String(model.tmbId) === String(tmbId) ||
    (teamPer?.isOwner && model.teamId && String(model.teamId) === String(teamId));

  if (isOwner) {
    return new ModelPermission({ isOwner: true });
  }

  const permission = new ModelPermission({ role: collaboratorRole ?? NullRoleVal });

  if (model.isShared) {
    permission.addRole(ReadRoleVal);
  }

  return permission;
};

export const getModelPermission = async ({
  model,
  teamId,
  tmbId,
  isRoot,
  teamPer
}: {
  model: SystemModelItemType;
  teamId: string;
  tmbId: string;
  isRoot?: boolean;
  teamPer?: { isOwner: boolean };
}) => {
  if (
    isRoot ||
    !model.isCustom ||
    String(model.tmbId) === String(tmbId) ||
    (teamPer?.isOwner && model.teamId && String(model.teamId) === String(teamId))
  ) {
    return getModelPermissionFromRole({
      model,
      teamId,
      tmbId,
      isRoot,
      teamPer
    });
  }

  const collaboratorRole = await getTmbPermission({
    resourceType: PerResourceTypeEnum.model,
    teamId,
    tmbId,
    resourceId: model.id
  });

  return getModelPermissionFromRole({
    model,
    teamId,
    tmbId,
    isRoot,
    teamPer,
    collaboratorRole
  });
};

export const getModelListWithPermission = async ({
  models,
  teamId,
  tmbId,
  teamPer,
  isRoot
}: {
  models: SystemModelItemType[];
  teamId: string;
  tmbId: string;
  teamPer: { isOwner: boolean };
  isRoot?: boolean;
}) => {
  const collaboratorRoleMap = isRoot
    ? new Map<string, PermissionValueType>()
    : await getModelCollaboratorRoleMap({
        teamId,
        tmbId
      });

  return models
    .map((model) => ({
      ...model,
      permission: getModelPermissionFromRole({
        model,
        teamId,
        tmbId,
        teamPer,
        isRoot,
        collaboratorRole: model.id ? collaboratorRoleMap.get(String(model.id)) : NullRoleVal
      })
    }))
    .filter((model) => model.permission.checkPer(ReadPermissionVal));
};
