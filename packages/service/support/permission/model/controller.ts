import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getGroupsByTmbId } from '../memberGroup/controllers';
import { getOrgsByTmbId } from '../org/controllers';
import { MongoResourcePermission } from '../schema';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';

export const getMyModels = async ({
  teamId,
  tmbId,
  isTeamOwner
}: {
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
}) => {
  if (isTeamOwner) {
    return global.systemModelList.map((m) => m.model);
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

  const myIds = [tmbId, ...groups.map((g) => g._id), ...orgs.map((o) => o._id)];

  const rps = await MongoResourcePermission.find({
    teamId,
    resourceType: PerResourceTypeEnum.model
  }).lean();

  const PermissionConfiguredModelSet = new Set(rps.map((rp) => rp.resourceName));
  const UnconfiguredModels = global.systemModelList.filter(
    (model) => !PermissionConfiguredModelSet.has(model.model)
  );

  const MyModels = rps.filter((rp) => myIds.includes(getCollaboratorId(rp)));

  return [...UnconfiguredModels.map((m) => m.model), ...MyModels.map((m) => m.resourceName)];
};
