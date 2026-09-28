import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import type { ReferencedAppsResponse } from '@fastgpt/global/openapi/core/app/common/api';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { findResourceKeysByCollaboratorsPermission } from '@fastgpt/service/support/permission/resourcePermissionService';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';

type PublishedApp = Pick<
  AppSchemaType,
  '_id' | 'avatar' | 'type' | 'name' | 'intro' | 'tmbId' | 'updateTime'
>;

/**
 * Applies the same App read-permission filtering used by the existing Skill
 * reference endpoint. Counts include inaccessible Apps, while list only
 * contains Apps that the requester may read.
 */
export const formatReadableReferencedApps = async ({
  apps,
  teamId,
  tmbId,
  isTeamOwner
}: {
  apps: PublishedApp[];
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
}): Promise<ReferencedAppsResponse> => {
  const readableAppIds = await (async () => {
    if (isTeamOwner) return;

    const [groupIds, orgIds] = await Promise.all([
      getGroupsByTmbId({ tmbId, teamId }).then((items) => items.map((item) => String(item._id))),
      getOrgIdSetWithParentByTmbId({ teamId, tmbId }).then((ids) => Array.from(ids))
    ]);

    return new Set(
      await findResourceKeysByCollaboratorsPermission({
        resourceType: PerResourceTypeEnum.app,
        teamId,
        tmbId,
        groupIds,
        orgIds,
        permission: ReadPermissionVal,
        matchLogic: 'or',
        personalPermissionPriority: true
      })
    );
  })();

  const visibleApps = apps
    .filter(
      (app) =>
        isTeamOwner || String(app.tmbId) === String(tmbId) || readableAppIds?.has(String(app._id))
    )
    .map((app) => ({
      _id: String(app._id),
      name: app.name,
      avatar: app.avatar || '',
      intro: app.intro || '',
      tmbId: String(app.tmbId),
      type: app.type,
      updateTime: app.updateTime
    }));

  return {
    list: await addSourceMember({ list: visibleApps }),
    hiddenCount: apps.length - visibleApps.length
  };
};
