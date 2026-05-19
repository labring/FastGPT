import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ModelPriceTierType } from '@fastgpt/global/core/ai/model.schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import type { SourceMemberType } from '@fastgpt/global/support/user/type';
import { getModelListWithPermission } from '@fastgpt/service/support/permission/model/controller';
import type { ModelPermission } from '@fastgpt/global/support/permission/model/controller';

export type listQuery = {};

export type listBody = {
  pageNum?: number;
  pageSize?: number;
};

export type ModelListItem = {
  id: string;
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
  permission: ModelPermission;
};

export type listResponse = ModelListItem[] | { list: ModelListItem[]; total: number };

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  res: ApiResponseType<any>
): Promise<listResponse> {
  const { pageNum, pageSize } = req.body;
  const isPaginated = pageNum !== undefined && pageSize !== undefined;

  if (isPaginated) {
    if (pageNum < 1 || !Number.isInteger(pageNum)) {
      throw new Error('pageNum must be a positive integer');
    }
    if (pageSize < 1 || !Number.isInteger(pageSize)) {
      throw new Error('pageSize must be a positive integer');
    }
  }

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

  // Batch-resolve tmbId → member info
  const tmbIdList = [...new Set(filteredModels.map((m) => m.tmbId).filter(Boolean) as string[])];
  const tmbList = await MongoTeamMember.find(
    { _id: { $in: tmbIdList } },
    'name avatar status'
  ).lean();
  const tmbMap = new Map(tmbList.map((t) => [String(t._id), t]));

  const list = filteredModels.map((model) => {
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

  if (isPaginated) {
    const total = list.length;
    const start = (pageNum! - 1) * pageSize!;
    return {
      list: list.slice(start, start + pageSize!),
      total
    };
  }

  return list;
}

export default NextAPI(handler);
