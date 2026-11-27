import { UserError } from '@fastgpt/global/common/error/utils';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { ApiKeyAuditParams } from '@fastgpt/global/support/openapi/schema';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { GroupMemberRole } from '@fastgpt/global/support/permission/memberGroup/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { Types, type ClientSession } from '../../../common/mongo';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { MongoAgentSkills } from '../../../core/ai/skill/model/schema';
import { MongoApp } from '../../../core/app/schema';
import { MongoDatasetCollection } from '../../../core/dataset/collection/schema';
import { MongoDataset } from '../../../core/dataset/schema';
import { disablePersonalApiKeys, transferAppApiKeys } from '../../openapi/service';
import { MongoOutLink } from '../../outLink/schema';
import { getGroupsByTmbId } from '../../permission/memberGroup/controllers';
import { MongoGroupMemberModel } from '../../permission/memberGroup/groupMemberSchema';
import { clearMemberModelsCache } from '../../permission/model/cache';
import {
  deleteCollaboratorPermissions,
  grantCollaboratorOnResources,
  transferTmbPermissions
} from '../../permission/resourcePermissionService';
import { MongoTeamMember } from './teamMemberSchema';

/** 成员离职指定转移人时需要按资源合并的非集合权限类型；刻意排除 team 级权限以避免团队管理/创建权限越权提升。 */
const TRANSFERABLE_NON_COLLECTION_PERMISSION_TYPES: PerResourceTypeEnum[] = [
  PerResourceTypeEnum.app,
  PerResourceTypeEnum.dataset,
  PerResourceTypeEnum.agentSkill,
  PerResourceTypeEnum.model
];

const TRANSFERABLE_RESOURCE_PERMISSION_TYPES: PerResourceTypeEnum[] = [
  ...TRANSFERABLE_NON_COLLECTION_PERMISSION_TYPES,
  PerResourceTypeEnum.collection
];

export type TransferTeamMemberResourcesParams = {
  teamId: string;
  fromTmbId: string;
  /** 目标接收成员 ID；不传时默认转移给当前团队活跃所有者。 */
  toTmbId?: string;
  session?: ClientSession;
};

export type TransferTeamMemberResourcesResult = {
  targetTmbId: string;
  isTargetTeamOwner: boolean;
  appKeyChanges: ApiKeyAuditParams[];
  disabledPersonalApiKeyCount: number;
};

/**
 * 封装团队成员离职/移出时的资源与权限转移：
 * - 转移成员名下成员组所有权、应用（含外链）、知识库、集合与技能的所有权到目标成员（默认团队 owner）；
 * - 应用 API Key 按绑定应用当前 owner 分别交接（必须在应用所有权转移之后、同一事务内执行）；
 * - 个人 API Key 不删除也不转移，直接停用；
 * - 目标为指定非 owner 成员时，按资源合并成员的个人资源权限（不含团队级权限）；目标为团队 owner 时仅补齐接管资源的 owner 权限并清理旧权限。
 */
export async function transferTeamMemberResources({
  teamId,
  fromTmbId,
  toTmbId,
  session
}: TransferTeamMemberResourcesParams): Promise<TransferTeamMemberResourcesResult> {
  const execute = async (
    activeSession: ClientSession
  ): Promise<TransferTeamMemberResourcesResult> => {
    const sourceTmbId = String(fromTmbId);

    // 1. 解析并校验接收人：显式指定时必须是同团队活跃成员，缺省时回退到团队活跃所有者。
    const targetMember = toTmbId
      ? await MongoTeamMember.findOne(
          {
            _id: toTmbId,
            teamId,
            status: TeamMemberStatusEnum.active
          },
          '_id role',
          { session: activeSession }
        ).lean()
      : await MongoTeamMember.findOne(
          {
            teamId,
            role: TeamMemberRoleEnum.owner,
            status: TeamMemberStatusEnum.active
          },
          '_id role',
          { session: activeSession }
        ).lean();

    if (!targetMember) {
      return Promise.reject(toTmbId ? TeamErrEnum.userNotActive : 'owner not exist');
    }

    const targetTmbId = String(targetMember._id);
    if (targetTmbId === sourceTmbId) {
      return Promise.reject(new UserError('Cannot transfer resources to the leaving member'));
    }

    const isTargetTeamOwner = targetMember.role === TeamMemberRoleEnum.owner;

    // 2. 转移由离职成员担任 owner 的成员组所有权，并清理旧 owner 行避免同一群组出现双 owner。
    const ownedGroups = await getGroupsByTmbId({
      tmbId: sourceTmbId,
      teamId,
      role: [GroupMemberRole.owner],
      session: activeSession
    });
    if (ownedGroups.length > 0) {
      const ownedGroupIds = ownedGroups.map((group) => new Types.ObjectId(String(group._id)));
      await MongoGroupMemberModel.bulkWrite(
        ownedGroupIds.map((groupId) => ({
          updateOne: {
            filter: {
              groupId,
              tmbId: new Types.ObjectId(targetTmbId)
            },
            update: {
              $set: { role: GroupMemberRole.owner }
            },
            upsert: true
          }
        })),
        { session: activeSession }
      );
      await MongoGroupMemberModel.deleteMany(
        {
          groupId: { $in: ownedGroupIds },
          tmbId: sourceTmbId
        },
        { session: activeSession }
      );
    }

    // 3. 转移应用所有权及离职成员创建的分享外链。
    const ownedApps = await MongoApp.find({ teamId, tmbId: sourceTmbId }, '_id', {
      session: activeSession
    }).lean();
    const ownedAppIds = ownedApps.map((app) => String(app._id));

    if (ownedAppIds.length > 0) {
      await MongoApp.updateMany(
        {
          teamId,
          _id: { $in: ownedAppIds },
          tmbId: sourceTmbId
        },
        {
          $set: { tmbId: targetTmbId }
        },
        { session: activeSession }
      );
      await MongoOutLink.updateMany(
        {
          teamId,
          tmbId: sourceTmbId,
          appId: { $in: ownedAppIds }
        },
        {
          $set: { tmbId: targetTmbId }
        },
        { session: activeSession }
      );
    }

    // 离职成员在他人应用下创建的外链同步归属到对应应用的当前 owner，避免离职/注销后分享链接失效。
    const remainingOutLinks = await MongoOutLink.find({ teamId, tmbId: sourceTmbId }, '_id appId', {
      session: activeSession
    }).lean();
    if (remainingOutLinks.length > 0) {
      const boundAppIds = Array.from(
        new Set(remainingOutLinks.map((link) => String(link.appId)).filter(Boolean))
      );
      const boundApps = await MongoApp.find(
        { teamId, _id: { $in: boundAppIds }, deleteTime: null },
        '_id tmbId',
        { session: activeSession }
      ).lean();
      const appOwnerMap = new Map(boundApps.map((app) => [String(app._id), String(app.tmbId)]));
      const outLinkOps = remainingOutLinks.flatMap((link) => {
        const nextOwnerId = appOwnerMap.get(String(link.appId));
        if (!nextOwnerId || nextOwnerId === sourceTmbId) return [];
        return [
          {
            updateOne: {
              filter: { _id: link._id, teamId, tmbId: sourceTmbId },
              update: { $set: { tmbId: nextOwnerId } }
            }
          }
        ];
      });
      if (outLinkOps.length > 0) {
        await MongoOutLink.bulkWrite(outLinkOps, { session: activeSession });
      }
    }

    // 4. 转移知识库、集合与技能所有权。
    const ownedDatasets = await MongoDataset.find({ teamId, tmbId: sourceTmbId }, '_id', {
      session: activeSession
    }).lean();
    const ownedDatasetIds = ownedDatasets.map((dataset) => String(dataset._id));
    if (ownedDatasetIds.length > 0) {
      await MongoDataset.updateMany(
        {
          teamId,
          _id: { $in: ownedDatasetIds },
          tmbId: sourceTmbId
        },
        {
          $set: { tmbId: targetTmbId }
        },
        { session: activeSession }
      );
    }

    // 托管知识库的集合归属与集合 ACL 由外部同步整份驱动，本地成员离职流程不得改写。
    const managedDatasets = await MongoDataset.find(
      { teamId, 'apiDatasetServer.permissionSync': true },
      '_id',
      { session: activeSession }
    ).lean();
    const managedDatasetIdSet = new Set(managedDatasets.map((dataset) => String(dataset._id)));

    const ownedCollections = await MongoDatasetCollection.find(
      { teamId, tmbId: sourceTmbId },
      '_id datasetId',
      { session: activeSession }
    ).lean();
    const transferableOwnedCollections =
      managedDatasetIdSet.size === 0
        ? ownedCollections
        : ownedCollections.filter(
            (collection) => !managedDatasetIdSet.has(String(collection.datasetId))
          );
    if (transferableOwnedCollections.length > 0) {
      await MongoDatasetCollection.updateMany(
        {
          teamId,
          _id: { $in: transferableOwnedCollections.map((collection) => collection._id) },
          tmbId: sourceTmbId
        },
        {
          $set: { tmbId: targetTmbId }
        },
        { session: activeSession }
      );
    }

    const ownedSkills = await MongoAgentSkills.find({ teamId, tmbId: sourceTmbId }, '_id', {
      session: activeSession
    }).lean();
    const ownedSkillIds = ownedSkills.map((skill) => String(skill._id));
    if (ownedSkillIds.length > 0) {
      await MongoAgentSkills.updateMany(
        {
          teamId,
          _id: { $in: ownedSkillIds },
          tmbId: sourceTmbId
        },
        {
          $set: { tmbId: targetTmbId }
        },
        { session: activeSession }
      );
    }

    // 5. 在应用所有权更新后的同一事务内交接应用 API Key，并停用个人 API Key。
    const appKeyChanges = await transferAppApiKeys({
      teamId,
      fromTmbIds: [sourceTmbId],
      session: activeSession
    });
    const disabledPersonalApiKeyCount = await disablePersonalApiKeys({
      teamId,
      tmbIds: [sourceTmbId],
      session: activeSession
    });

    // 6. 处理资源 ACL：
    // - 指定转移给非团队 owner 成员时，将离职成员在各资源上的权限按位合并到接收人（排除团队级权限）；
    // - 转移给团队 owner 时无需继承其对他人资源的协作者权限，仅确保接管资源的 owner ACL 完整后清空旧权限。
    if (!isTargetTeamOwner) {
      if (managedDatasetIdSet.size === 0) {
        await transferTmbPermissions({
          teamId,
          oldTmbId: sourceTmbId,
          newTmbId: targetTmbId,
          resourceType: TRANSFERABLE_RESOURCE_PERMISSION_TYPES,
          session: activeSession
        });
      } else {
        await transferTmbPermissions({
          teamId,
          oldTmbId: sourceTmbId,
          newTmbId: targetTmbId,
          resourceType: TRANSFERABLE_NON_COLLECTION_PERMISSION_TYPES,
          session: activeSession
        });
        const nonManagedCollections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $nin: Array.from(managedDatasetIdSet) }
          },
          '_id',
          { session: activeSession }
        ).lean();
        if (nonManagedCollections.length > 0) {
          await transferTmbPermissions({
            teamId,
            oldTmbId: sourceTmbId,
            newTmbId: targetTmbId,
            resourceType: PerResourceTypeEnum.collection,
            resourceIds: nonManagedCollections.map((collection) => String(collection._id)),
            session: activeSession
          });
        }
      }
    }

    // 仅为已开启集合权限且非外部托管的知识库补齐集合 owner 行，严守「关闭态无集合 ACL 行」与「托管库不本地改写」不变量。
    const enabledOwnedCollectionIds = await (async () => {
      if (transferableOwnedCollections.length === 0) return [];
      const collectionDatasetIds = Array.from(
        new Set(transferableOwnedCollections.map((collection) => String(collection.datasetId)))
      );
      const enabledDatasets = await MongoDataset.find(
        {
          teamId,
          _id: { $in: collectionDatasetIds },
          collectionPermissionEnabled: true,
          'apiDatasetServer.permissionSync': { $ne: true }
        },
        '_id',
        { session: activeSession }
      ).lean();
      const enabledDatasetIdSet = new Set(enabledDatasets.map((dataset) => String(dataset._id)));
      return transferableOwnedCollections
        .filter((collection) => enabledDatasetIdSet.has(String(collection.datasetId)))
        .map((collection) => String(collection._id));
    })();

    if (ownedAppIds.length > 0) {
      await grantCollaboratorOnResources({
        teamId,
        resourceTypes: [PerResourceTypeEnum.app],
        resourceIds: ownedAppIds,
        collaborator: { tmbId: targetTmbId },
        permission: OwnerRoleVal,
        session: activeSession
      });
    }
    if (ownedDatasetIds.length > 0) {
      await grantCollaboratorOnResources({
        teamId,
        resourceTypes: [PerResourceTypeEnum.dataset],
        resourceIds: ownedDatasetIds,
        collaborator: { tmbId: targetTmbId },
        permission: OwnerRoleVal,
        session: activeSession
      });
    }
    if (enabledOwnedCollectionIds.length > 0) {
      await grantCollaboratorOnResources({
        teamId,
        resourceTypes: [PerResourceTypeEnum.collection],
        resourceIds: enabledOwnedCollectionIds,
        collaborator: { tmbId: targetTmbId },
        permission: OwnerRoleVal,
        session: activeSession
      });
    }
    if (ownedSkillIds.length > 0) {
      await grantCollaboratorOnResources({
        teamId,
        resourceTypes: [PerResourceTypeEnum.agentSkill],
        resourceIds: ownedSkillIds,
        collaborator: { tmbId: targetTmbId },
        permission: OwnerRoleVal,
        session: activeSession
      });
    }

    // 清理离职成员残留权限（含团队级权限，以及转给团队 owner 时在他人资源上的协作者权限）。
    await deleteCollaboratorPermissions({
      teamId,
      collaborator: { tmbId: sourceTmbId },
      session: activeSession
    });

    // 7. 失效团队模型权限缓存，使接收人合并后的模型权限立即生效。
    await clearMemberModelsCache({ teamId, session: activeSession });

    return {
      targetTmbId,
      isTargetTeamOwner,
      appKeyChanges,
      disabledPersonalApiKeyCount
    };
  };

  if (session) {
    return execute(session);
  }
  return mongoSessionRun(execute);
}
