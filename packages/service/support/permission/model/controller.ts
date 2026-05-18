import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgsByTmbId } from '../org/controllers';
import { MongoResourcePermission } from '../schema';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';

export const getMyModels = async ({
  teamId,
  tmbId,
  teamPer,
  isRoot
}: {
  teamId: string;
  tmbId: string;
  teamPer: { isOwner: boolean };
  isRoot?: boolean;
}) => {
  // Root sees all active models across all teams
  if (isRoot) {
    return global.systemActiveModelList.map((m) => m.id);
  }

  const [groups, orgs] = await Promise.all([
    getGroupsByTmbId({
      teamId,
      tmbId
    }),
    getOrgsByTmbId({
      teamId,
      tmbId
    })
  ]);

  const myIdSet = new Set([tmbId, ...groups.map((g) => g._id), ...orgs.map((o) => o._id)]);

  const rps = await MongoResourcePermission.find({
    teamId,
    resourceType: PerResourceTypeEnum.model
  }).lean();

  const permissionModelSet = new Set(
    rps.filter((rp) => myIdSet.has(getCollaboratorId(rp))).map((rp) => String(rp.resourceId))
  );

  return global.systemActiveModelList
    .filter((m) => {
      // System models (no creator) are only visible if shared by root
      if (!m.isCustom) return m.isShared === true;
      // Globally shared models are visible to all
      if (m.isShared) return true;
      // Creator's own models
      if (String(m.tmbId) === String(tmbId)) return true;
      // Models user has collaborator permission for (matched by id)
      if (m.id && permissionModelSet.has(m.id)) return true;
      // Team owner sees all models belonging to their team
      if (teamPer.isOwner && m.teamId && String(m.teamId) === String(teamId)) return true;
      return false;
    })
    .map((m) => m.id);
};
