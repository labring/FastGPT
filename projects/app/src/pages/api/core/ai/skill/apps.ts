import { MongoApp } from '@fastgpt/service/core/app/schema';
import { NextAPI } from '@/service/middleware/entry';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { findResourceKeysByCollaboratorsPermission } from '@fastgpt/service/support/permission/resourcePermissionService';
import type {
  ListAppsBySkillIdQuery,
  ListAppsBySkillIdResponse
} from '@fastgpt/global/core/ai/skill/api';
import { ListAppsBySkillIdQuerySchema } from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildAppSkillRefMongoQuery } from '@fastgpt/service/core/app/resourceRefs';

async function handler(
  req: ApiRequestProps<unknown, ListAppsBySkillIdQuery>
): Promise<ListAppsBySkillIdResponse> {
  const { skillId } = parseApiInput({ req, querySchema: ListAppsBySkillIdQuerySchema }).query;

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

  // 查询最新发布版本缓存引用该 skillId 的应用。
  const apps = await MongoApp.find(
    {
      teamId,
      deleteTime: null,
      ...buildAppSkillRefMongoQuery(skillId)
    },
    '_id parentId avatar type name intro tmbId updateTime inheritPermission'
  )
    .sort({ updateTime: -1 })
    .lean();

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
      avatar: app.avatar || '',
      intro: app.intro || '',
      tmbId: String(app.tmbId),
      type: app.type,
      updateTime: app.updateTime
    }));
  const hiddenCount = apps.length - visibleApps.length;

  const list = await addSourceMember({ list: visibleApps });
  return { list, hiddenCount };
}

export default NextAPI(handler);
