import type { AppResource } from '@fastgpt/global/core/app/type';
import type { WorkflowResourceEntities } from '../../../core/workflow/utils/resource';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import {
  NullRoleVal,
  PerResourceTypeEnum,
  ReadRoleVal,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';
import { SkillPermission } from '@fastgpt/global/support/permission/skill/controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { MongoApp } from '../../../core/app/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { MongoAgentSkills } from '../../../core/ai/skill/model/schema';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../org/controllers';
import { MongoResourcePermission } from '../schema';

const getResourcePermission = ({
  permissions,
  id,
  parentId,
  inheritPermission,
  canInherit
}: {
  permissions: Map<string, number | undefined>;
  id: string;
  parentId?: string;
  inheritPermission: boolean;
  canInherit: boolean;
}) =>
  sumPer(
    permissions.get(id) ?? NullRoleVal,
    ...(inheritPermission && canInherit && parentId
      ? [permissions.get(parentId) ?? NullRoleVal]
      : [])
  );

/** 在保存、发布或 Test/Debug 边界批量校验应用引用资源的读取权限。 */
export const checkAppResourceReadPermissions = async ({
  resources,
  tmbId,
  isRoot = false,
  resourceEntities,
  allowRootCrossTeam = false
}: {
  resources: AppResource[];
  tmbId: string;
  isRoot?: boolean;
  resourceEntities?: WorkflowResourceEntities;
  /** 仅 Test/Debug 临时上下文允许 root 校验跨团队资源。 */
  allowRootCrossTeam?: boolean;
}) => {
  const appIds = Array.from(
    new Set(
      resources
        .filter((resource) => resource.type === 'agent' || resource.type === 'tool')
        .map((resource) => resource.id)
    )
  );
  const datasetIds = Array.from(
    new Set(
      resources.filter((resource) => resource.type === 'dataset').map((resource) => resource.id)
    )
  );
  const skillIds = Array.from(
    new Set(
      resources.filter((resource) => resource.type === 'skill').map((resource) => resource.id)
    )
  );

  if (appIds.length === 0 && datasetIds.length === 0 && skillIds.length === 0) return;

  const [{ teamId, permission: tmbPermission }, loadedEntities] = await Promise.all([
    getTmbInfoByTmbId({ tmbId }),
    resourceEntities ??
      Promise.all([
        appIds.length
          ? MongoApp.find({ _id: { $in: appIds }, deleteTime: null }).lean()
          : Promise.resolve([]),
        datasetIds.length
          ? MongoDataset.find({ _id: { $in: datasetIds }, deleteTime: null }).lean()
          : Promise.resolve([]),
        skillIds.length
          ? MongoAgentSkills.find({ _id: { $in: skillIds }, deleteTime: null }).lean()
          : Promise.resolve([])
      ]).then(([apps, datasets, skills]) => ({ apps, datasets, skills }))
  ]);
  const { apps, datasets, skills } = loadedEntities;

  const [groupList, orgIdSet] = await Promise.all([
    getGroupsByTmbId({ tmbId, teamId }),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId })
  ]);
  const groupIds = groupList.map((group) => String(group._id));
  const orgIds = Array.from(orgIdSet);

  const appResourceIds = Array.from(
    new Set(
      apps.flatMap((app) => [String(app._id), ...(app.parentId ? [String(app.parentId)] : [])])
    )
  );
  const datasetResourceIds = Array.from(
    new Set(
      datasets.flatMap((dataset) => [
        String(dataset._id),
        ...(dataset.parentId ? [String(dataset.parentId)] : [])
      ])
    )
  );
  const skillResourceIds = Array.from(
    new Set(
      skills.flatMap((skill) => [
        String(skill._id),
        ...(skill.parentId ? [String(skill.parentId)] : [])
      ])
    )
  );

  const permissionList = await MongoResourcePermission.find(
    {
      teamId,
      resourceType: {
        $in: [PerResourceTypeEnum.app, PerResourceTypeEnum.dataset, PerResourceTypeEnum.agentSkill]
      },
      resourceId: { $in: [...appResourceIds, ...datasetResourceIds, ...skillResourceIds] },
      $or: [
        { tmbId },
        ...(groupIds.length ? [{ groupId: { $in: groupIds } }] : []),
        ...(orgIds.length ? [{ orgId: { $in: orgIds } }] : [])
      ]
    },
    'resourceType resourceId permission tmbId'
  ).lean();

  const permissionMap = new Map<string, { direct?: number; inherited: number[] }>();
  permissionList.forEach((item) => {
    const key = `${item.resourceType}:${String(item.resourceId)}`;
    const record = permissionMap.get(key) ?? { inherited: [] };
    if (item.tmbId) {
      if (record.direct === undefined) record.direct = item.permission;
    } else {
      record.inherited.push(item.permission);
    }
    permissionMap.set(key, record);
  });

  const buildPermissionMap = (resourceType: PerResourceTypeEnum, resourceIds: string[]) =>
    new Map(
      resourceIds.map((resourceId) => {
        const record = permissionMap.get(`${resourceType}:${resourceId}`);
        return [resourceId, record?.direct ?? sumPer(...(record?.inherited ?? []))];
      })
    );

  const appPermissions = buildPermissionMap(PerResourceTypeEnum.app, appResourceIds);
  const datasetPermissions = buildPermissionMap(PerResourceTypeEnum.dataset, datasetResourceIds);
  const skillPermissions = buildPermissionMap(PerResourceTypeEnum.agentSkill, skillResourceIds);

  const appMap = new Map(apps.map((app) => [String(app._id), app]));
  const datasetMap = new Map(datasets.map((dataset) => [String(dataset._id), dataset]));
  const skillMap = new Map(skills.map((skill) => [String(skill._id), skill]));

  resources.forEach((resource) => {
    if (resource.type === 'agent' || resource.type === 'tool') {
      const app = appMap.get(resource.id);
      if (!app) throw AppErrEnum.unExist;
      if (!allowRootCrossTeam && String(app.teamId) !== teamId) throw AppErrEnum.unAuthApp;
      if (isRoot) return;
      if (app.type === AppTypeEnum.hidden) return;

      const permission = new AppPermission({
        role: getResourcePermission({
          permissions: appPermissions,
          id: resource.id,
          parentId: app.parentId ? String(app.parentId) : undefined,
          inheritPermission: app.inheritPermission === true,
          canInherit: !AppFolderTypeList.includes(app.type)
        }),
        isOwner: tmbPermission.isOwner || String(app.tmbId) === tmbId
      });
      if (app.favourite || app.quick) permission.addRole(ReadRoleVal);
      if (!permission.checkPer(ReadPermissionVal)) throw AppErrEnum.unAuthApp;
      return;
    }

    if (resource.type === 'dataset') {
      const dataset = datasetMap.get(resource.id);
      if (!dataset) throw DatasetErrEnum.unExist;
      if (!allowRootCrossTeam && String(dataset.teamId) !== teamId) {
        throw DatasetErrEnum.unAuthDataset;
      }
      if (isRoot) return;

      const permission = new DatasetPermission({
        role: getResourcePermission({
          permissions: datasetPermissions,
          id: resource.id,
          parentId: dataset.parentId ? String(dataset.parentId) : undefined,
          inheritPermission: dataset.inheritPermission === true,
          canInherit: dataset.type !== DatasetTypeEnum.folder
        }),
        isOwner: tmbPermission.isOwner || String(dataset.tmbId) === tmbId
      });
      if (!permission.checkPer(ReadPermissionVal)) throw DatasetErrEnum.unAuthDataset;
      return;
    }

    if (resource.type === 'skill') {
      const skill = skillMap.get(resource.id);
      if (!skill) throw SkillErrEnum.unExist;
      if (skill.source === AgentSkillSourceEnum.system) return;
      if (!allowRootCrossTeam && String(skill.teamId) !== teamId) throw SkillErrEnum.unAuthSkill;
      if (isRoot) return;

      const permission = new SkillPermission({
        role: getResourcePermission({
          permissions: skillPermissions,
          id: resource.id,
          parentId: skill.parentId ? String(skill.parentId) : undefined,
          inheritPermission: skill.inheritPermission !== false,
          canInherit: skill.type !== AgentSkillTypeEnum.folder
        }),
        isOwner: tmbPermission.isOwner || String(skill.tmbId) === tmbId
      });
      if (!permission.checkPer(ReadPermissionVal)) throw SkillErrEnum.unAuthSkill;
    }
  });
};
