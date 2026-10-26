import { NextAPI } from '@/service/middleware/entry';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  ReplaceInvalidModelReferencesBodySchema,
  ReplaceInvalidModelReferencesResponseSchema,
  type ReplaceInvalidModelReferencesBody,
  type ReplaceInvalidModelReferencesResponse
} from '@fastgpt/global/openapi/core/ai/model/invalidReferences';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';
import { replaceInvalidModelReferences } from '@/service/core/ai/model/invalidReferences/service';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

/** 只允许当前团队的实际 owner 发起同步替换；每批写入前复查权限和目标目录。 */
export async function handler(
  req: ApiRequestProps<ReplaceInvalidModelReferencesBody>
): Promise<ReplaceInvalidModelReferencesResponse> {
  if (req.method !== 'POST') throw new Error('Method not allowed');
  const { replacement } = parseApiInput({
    req,
    bodySchema: ReplaceInvalidModelReferencesBodySchema
  }).body;

  const { tmb, teamId, tmbId, isRoot } = await authUserPer({ req, authToken: true });
  if (tmb.role !== TeamMemberRoleEnum.owner || tmb.status !== TeamMemberStatusEnum.active) {
    throw TeamErrEnum.unAuthTeam;
  }

  const handle = await getTeamModelHandle({ teamId });

  const assertCanContinue = async () => {
    const currentTmb = await getTmbInfoByTmbId({ tmbId });
    if (
      currentTmb.teamId !== teamId ||
      currentTmb.role !== TeamMemberRoleEnum.owner ||
      currentTmb.status !== TeamMemberStatusEnum.active
    ) {
      throw TeamErrEnum.unAuthTeam;
    }

    const currentHandle = await getTeamModelHandle({ teamId });
    if (currentHandle.version !== handle.version) {
      throw new Error('Model catalog changed during replacement');
    }

    const authorizedIds = await getAuthorizedModelIds({
      actor: { teamId, tmbId, isRoot, teamPermission: currentTmb.permission },
      handle: currentHandle,
      // 长请求需读取实时 ACL；includeInactive 绕过成员目录缓存，模型启用态随后由 getModelData 检查。
      includeInactive: true
    });
    currentHandle.getModelData(
      { modelId: replacement.llmModelId },
      { type: ModelTypeEnum.llm, authorizedIds }
    );
    currentHandle.getModelData(
      { modelId: replacement.sttModelId },
      { type: ModelTypeEnum.stt, authorizedIds }
    );
    currentHandle.getModelData(
      { modelId: replacement.rerankModelId },
      { type: ModelTypeEnum.rerank, authorizedIds }
    );
  };

  await assertCanContinue();
  const result = await replaceInvalidModelReferences({
    teamId,
    replacement,
    handle,
    assertCanContinue
  });
  const response = ReplaceInvalidModelReferencesResponseSchema.parse(result);
  await addAuditLog({
    teamId,
    tmbId,
    event: AuditEventEnum.REPLACE_INVALID_MODELS,
    params: {
      replacement,
      counts: response.counts,
      completed: response.completed
    }
  });
  return response;
}

export default NextAPI(handler);
