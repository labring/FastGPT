import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getModelListWithPermission } from '@fastgpt/service/support/permission/model/controller';
import type { ListModelsResponse } from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<any, any>,
  res: ApiResponseType<any>
): Promise<ListModelsResponse> {
  const {
    tmbId,
    teamId,
    isRoot,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  const filteredModels = await getModelListWithPermission({
    models: global.systemModelList,
    teamId,
    tmbId,
    teamPer,
    isRoot
  });

  // Batch-resolve tmbId -> member info
  const tmbIdList = [...new Set(filteredModels.map((m) => m.tmbId).filter(Boolean) as string[])];
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
        : undefined,
      permission: model.permission
    };
  });
}

export default NextAPI(handler);
