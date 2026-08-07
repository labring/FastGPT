import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { parseV2Pagination } from '@fastgpt/service/common/api/paginationV2';
import { listReadableAgentSkillsV2 } from '@fastgpt/service/core/ai/skill/manage/listV2';
import {
  ListSkillsV2QuerySchema,
  type ListSkillsV2Query,
  type ListSkillsV2Response
} from '@fastgpt/global/openapi/core/ai/skill/api';

/*
  获取 Skill 列表（分页版）
  - 入参从 body 读取（与旧路由一致）；分页参数 pageSize/offset/pageNum
  - 权限谓词与页内实现见 listReadableAgentSkillsV2
*/

async function handler(req: ApiRequestProps<ListSkillsV2Query>): Promise<ListSkillsV2Response> {
  const {
    parentId,
    source,
    searchKey,
    category,
    type,
    skillIds,
    withAppCount,
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  } = parseApiInput({
    req,
    bodySchema: ListSkillsV2QuerySchema
  }).body;
  const { pageSize, offset } = parseV2Pagination({
    pageSize: rawPageSize,
    offset: rawOffset,
    pageNum: rawPageNum
  });
  const selectedSkillIds = skillIds?.filter(Boolean) ?? [];
  const isSkillIdsQuery = selectedSkillIds.length > 0;

  // Auth user permission
  const [{ tmbId, teamId, permission: teamPer }] = await Promise.all([
    authUserPer({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal
    }),
    ...(parentId && !isSkillIdsQuery
      ? [
          authSkill({
            req,
            authToken: true,
            authApiKey: true,
            per: ReadPermissionVal,
            skillId: parentId
          })
        ]
      : [])
  ]);

  const result = await listReadableAgentSkillsV2({
    teamId,
    tmbId,
    teamPer,
    parentId,
    source,
    searchKey,
    category,
    type,
    skillIds: selectedSkillIds,
    pageSize,
    offset,
    withAppCount
  });

  // 与旧接口一致：不 parse 响应（旧 skill/list 直接返回 result）
  return result;
}

export default NextAPI(handler);
