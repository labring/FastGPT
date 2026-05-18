import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import type { ModelPriceTierType } from '@fastgpt/global/core/ai/model.schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgsByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import type { SourceMemberType } from '@fastgpt/global/support/user/type';

export type listQuery = {};

export type listBody = {};

export type listResponse = {
  id?: string;
  type: `${ModelTypeEnum}`;
  name: string;
  avatar: string | undefined;
  provider: string;
  model: string;
  testMode?: boolean;
  charsPointsPrice?: number;
  inputPrice?: number;
  outputPrice?: number;
  priceTiers?: ModelPriceTierType[];

  isActive: boolean;
  isCustom: boolean;
  isTuned: boolean;

  // Tag
  contextToken?: number;
  vision?: boolean;
  toolChoice?: boolean;

  // Permission
  tmbId?: string;
  isShared: boolean;
  sourceMember?: SourceMemberType;
}[];

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  res: ApiResponseType<any>
): Promise<listResponse> {
  const { tmbId, teamId, isRoot, permission: teamPer } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  // Root sees all models, no permission queries needed
  if (isRoot) {
    const allModels = global.systemModelList;
    const tmbIdList = [
      ...new Set(allModels.map((m) => m.tmbId).filter(Boolean) as string[])
    ];
    const tmbList = await MongoTeamMember.find(
      { _id: { $in: tmbIdList } },
      'name avatar status'
    ).lean();
    const tmbMap = new Map(tmbList.map((t) => [String(t._id), t]));

    return allModels.map((model) => {
      const member = model.tmbId ? tmbMap.get(String(model.tmbId)) : undefined;
      return {
        id: model.id,
        type: model.type,
        provider: model.provider,
        model: model.model,
        name: model.name,
        avatar: model.avatar,
        charsPointsPrice: model.charsPointsPrice,
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
        priceTiers: model.priceTiers,
        isActive: model.isActive ?? false,
        isCustom: model.isCustom ?? false,
        testMode: model?.testMode,
        isTuned: model.isTuned ?? false,
        contextToken:
          'maxContext' in model ? model.maxContext : 'maxToken' in model ? model.maxToken : undefined,
        vision: 'vision' in model ? model.vision : undefined,
        toolChoice: 'toolChoice' in model ? model.toolChoice : undefined,
        tmbId: model.tmbId ? String(model.tmbId) : undefined,
        isShared: model.isShared ?? false,
        sourceMember: member
          ? { name: member.name, avatar: member.avatar ?? undefined, status: member.status }
          : undefined
      };
    }) as any;
  }

  // Query collaborator permissions for non-root users
  const [groups, orgs, rps] = await Promise.all([
    getGroupsByTmbId({ teamId, tmbId }),
    getOrgsByTmbId({ teamId, tmbId }),
    MongoResourcePermission.find({
      teamId,
      resourceType: PerResourceTypeEnum.model
    }).lean()
  ]);

  const myIdSet = new Set([tmbId, ...groups.map((g) => g._id), ...orgs.map((o) => o._id)]);
  const permissionModelSet = new Set(
    rps.filter((rp) => myIdSet.has(getCollaboratorId(rp))).map((rp) => String(rp.resourceId))
  );

  const filteredModels = global.systemModelList.filter((model) => {
    // System models (no creator) are only visible if shared by root
    if (!model.isCustom) return model.isShared === true;
    if (model.isShared) return true;
    if (String(model.tmbId) === String(tmbId)) return true;
    if (model.id && permissionModelSet.has(model.id)) return true;
    if (teamPer.isOwner && model.teamId && String(model.teamId) === String(teamId)) return true;
    return false;
  });

  // Batch-resolve tmbId → member info
  const tmbIdList = [
    ...new Set(filteredModels.map((m) => m.tmbId).filter(Boolean) as string[])
  ];
  const tmbList = await MongoTeamMember.find(
    { _id: { $in: tmbIdList } },
    'name avatar status'
  ).lean();
  const tmbMap = new Map(tmbList.map((t) => [String(t._id), t]));

  return filteredModels.map((model) => {
    const member = model.tmbId ? tmbMap.get(String(model.tmbId)) : undefined;

    return {
      id: model.id,
      type: model.type,
      provider: model.provider,
      model: model.model,
      name: model.name,
      avatar: model.avatar,
      charsPointsPrice: model.charsPointsPrice,
      inputPrice: model.inputPrice,
      outputPrice: model.outputPrice,
      priceTiers: model.priceTiers,
      isActive: model.isActive ?? false,
      isCustom: model.isCustom ?? false,
      testMode: model?.testMode,
      isTuned: model.isTuned ?? false,

      contextToken:
        'maxContext' in model ? model.maxContext : 'maxToken' in model ? model.maxToken : undefined,
      vision: 'vision' in model ? model.vision : undefined,
      toolChoice: 'toolChoice' in model ? model.toolChoice : undefined,

      tmbId: model.tmbId ? String(model.tmbId) : undefined,
      isShared: model.isShared ?? false,
      sourceMember: member
        ? { name: member.name, avatar: member.avatar ?? undefined, status: member.status }
        : undefined
    };
  });
}

export default NextAPI(handler);
