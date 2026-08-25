import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgsByTmbId } from '../org/controllers';
import { MongoResourcePermission } from '../schema';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import type { SystemModelItemType } from '../../../core/ai/model/type';
import type { Permission } from '@fastgpt/global/support/permission/controller';

/**
 * Returns the full list of models accessible to the current user.
 *
 * Visibility rules (design §1.3):
 * - System models (isSystem) are visible platform-wide (including disabled)
 * - Own private models are always visible (including disabled)
 * - Same-team models: visible only when a permission entry exists AND the user is in
 *   the collaborator list; with no permission configured -> private (creator only)
 * - Other-team models are never visible
 */
export const getUserAccessibleModels = async ({
  teamId,
  tmbId,
  tmbPer
}: {
  teamId: string;
  tmbId: string;
  tmbPer: Permission;
}): Promise<SystemModelItemType[]> => {
  // 1. Own models — always visible (system models store no tmbId; only private models match)
  const ownModels = global.systemModelList.filter((m) => !m.isSystem && String(m.tmbId) === tmbId);

  // 2. Non-own models — require visibility checks
  const otherModels = global.systemModelList.filter((m) => m.isSystem || String(m.tmbId) !== tmbId);

  // Query model permission configs for the current team
  const [rps, groups, orgs] = await Promise.all([
    MongoResourcePermission.find({
      teamId,
      resourceType: PerResourceTypeEnum.model
    }).lean(),
    getGroupsByTmbId({ teamId, tmbId }),
    getOrgsByTmbId({ teamId, tmbId })
  ]);

  const myIdSet = new Set([
    tmbId,
    ...groups.map((g) => String(g._id)),
    ...orgs.map((o) => String(o._id))
  ]);

  // Models with a permission entry configured (resourceId = modelId)
  const permissionConfiguredIds = new Set(
    rps.map((rp) => (rp.resourceId ? String(rp.resourceId) : rp.resourceName))
  );
  // Models where the user is in the collaborator list
  const myPermissionIds = new Set(
    rps
      .filter((rp) => myIdSet.has(getCollaboratorId(rp)))
      .map((rp) => (rp.resourceId ? String(rp.resourceId) : rp.resourceName))
  );

  const accessibleModels = otherModels.filter((m) => {
    // System models are visible platform-wide (including disabled)
    if (m.isSystem) return true;
    // Other-team models are not visible
    if (String(m.teamId) !== String(teamId)) return false;
    // Same-team model: configured -> must be in collaborator list; not configured -> private
    if (!permissionConfiguredIds.has(m.id)) return false;
    return myPermissionIds.has(m.id);
  });

  return [...ownModels, ...accessibleModels];
};
