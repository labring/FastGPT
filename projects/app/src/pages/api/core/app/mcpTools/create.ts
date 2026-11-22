import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { onCreateApp } from '../create';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CreateMcpToolsBodySchema,
  type CreateMcpToolsBodyType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';
import {
  CreateAppResponseSchema,
  type CreateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { assertMCPUrlNotInternal } from '@fastgpt/service/core/app/mcp';
import { encodeMcpToolSetNodesForStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';

async function handler(
  req: ApiRequestProps<CreateMcpToolsBodyType>
): Promise<CreateAppResponseType> {
  const {
    name,
    avatar,
    toolList,
    url,
    headerSecret = {},
    authMode = 'headers',
    clientMode,
    scope,
    parentId,
    inheritPermission
  } = parseApiInput({
    req,
    bodySchema: CreateMcpToolsBodySchema
  }).body;

  const { teamId, tmbId } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  await assertMCPUrlNotInternal(url);

  const formatedHeaderAuth = authMode === 'headers' ? storeSecretValue(headerSecret) : undefined;
  const oauth =
    authMode === 'oauth'
      ? {
          schemaVersion: 1 as const,
          clientMode: clientMode ?? ('auto' as const),
          ...(scope !== undefined ? { scope } : {}),
          // 新节点不做迁移：首次启用 OAuth 从 seq 0 开始。
          credentialSeq: 0
        }
      : undefined;

  const mcpToolsId = await mongoSessionRun(async (session) => {
    const toolSetRuntimeNode = getMCPToolSetRuntimeNode({
      url,
      toolList,
      name,
      avatar: avatar ?? undefined,
      headerSecret: formatedHeaderAuth,
      authMode,
      oauth
    });
    const mcpToolsId = await onCreateApp({
      name,
      avatar: avatar ?? undefined,
      parentId,
      teamId,
      tmbId,
      type: AppTypeEnum.mcpToolSet,
      nodes: [toolSetRuntimeNode],
      storageNodes: encodeMcpToolSetNodesForStorage([toolSetRuntimeNode]),
      inheritPermission,
      session
    });

    return mcpToolsId;
  });

  pushTrack.createApp({
    type: AppTypeEnum.mcpToolSet,
    appId: mcpToolsId,
    teamId,
    tmbId
  });

  return CreateAppResponseSchema.parse(mcpToolsId);
}

export default NextAPI(handler);
