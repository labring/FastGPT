import type { ApiRequestProps } from '@fastgpt/next/type';
import { ReferencedAppsResponseSchema } from '@fastgpt/global/core/app/type';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { findResourceKeysByCollaboratorsPermission } from '@fastgpt/service/support/permission/resourcePermissionService';
import { addSourceMember } from '@fastgpt/service/support/user/utils';

type ReferencedApp = {
  _id: unknown;
  parentId?: unknown;
  avatar?: string | null;
  type: string;
  name: string;
  intro?: string | null;
  tmbId: unknown;
  updateTime: Date;
  inheritPermission?: boolean;
};

/** Apply App read permissions without leaking metadata for inaccessible referencing Apps. */
export const formatReadableReferencedApps = async ({
  req,
  apps
}: {
  req: ApiRequestProps;
  apps: ReferencedApp[];
}) => {
  const {
    tmbId,
    teamId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const readableAppIds = await (async () => {
    if (teamPer.isOwner) return;

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
        teamPer.isOwner ||
        String(app.tmbId) === String(tmbId) ||
        readableAppIds?.has(String(app._id))
    )
    .map((app) => ({
      _id: String(app._id),
      name: app.name,
      avatar: app.avatar ?? '',
      intro: app.intro ?? '',
      tmbId: String(app.tmbId),
      type: app.type,
      updateTime: app.updateTime
    }));

  return ReferencedAppsResponseSchema.parse({
    list: await addSourceMember({ list: visibleApps }),
    hiddenCount: apps.length - visibleApps.length
  });
};
