import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserError } from '@fastgpt/global/common/error/utils';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import { storeSecretValue } from '@fastgpt/service/common/secret/utils';
import {
  beforeUpdateAppFormat,
  updateParentFoldersUpdateTime
} from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { updateAppPublishedVersion } from '@fastgpt/service/core/app/version/controller';
import {
  UpdateMcpToolsBodySchema,
  UpdateMcpToolsResponseSchema,
  type UpdateMcpToolsBodyType,
  type UpdateMcpToolsResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';
import { assertMCPUrlNotInternal } from '@fastgpt/service/core/app/mcp';
import { encodeMcpToolSetNodesForStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';
import {
  getMcpToolSetVersionDoc,
  getNodeMcpToolSet,
  mergeMcpOAuthFromPublished,
  resolveMcpOAuthNode
} from '@fastgpt/service/core/app/mcpOAuth/credential';

async function handler(
  req: ApiRequestProps<UpdateMcpToolsBodyType>
): Promise<UpdateMcpToolsResponseType> {
  const {
    body: { appId, url, toolList, headerSecret, authMode, clientMode, scope }
  } = parseApiInput({
    req,
    bodySchema: UpdateMcpToolsBodySchema
  });
  const { app, teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: ManagePermissionVal
  });

  await assertMCPUrlNotInternal(url);

  const formatedHeaderAuth = storeSecretValue(headerSecret);

  await mongoSessionRun(async (session) => {
    // 事务内重新读取并合并：刷新令牌抢先写入时由 mongoSessionRun 重试，绝不覆盖新 token。
    const version = await getMcpToolSetVersionDoc(appId, session);
    const currentNode = resolveMcpOAuthNode(version);
    const currentToolSet = getNodeMcpToolSet(currentNode);
    const previousAuthMode = currentToolSet?.authMode ?? 'headers';
    const effectiveAuthMode = authMode ?? previousAuthMode;
    // 请求省略 authMode 时只能在这里拿到真实模式：存量 headers 节点仍须满足
    // 「headers 模式 toolList 非空」的不变量，否则保存后节点与运行期都无工具可用。
    if (effectiveAuthMode !== 'oauth' && toolList.length === 0) {
      throw new UserError('authMode=headers 时 toolList 不能为空');
    }
    const expectedCredentialSeq = currentToolSet?.oauth?.credentialSeq ?? 0;
    const merged = mergeMcpOAuthFromPublished({
      existingOAuth: currentToolSet?.oauth,
      previousAuthMode,
      nextAuthMode: authMode,
      urlChanged: url !== currentToolSet?.url,
      nextClientMode: clientMode,
      nextScope: scope
    });
    const nextOAuth = merged.oauth
      ? {
          ...merged.oauth,
          credentialSeq: expectedCredentialSeq + merged.credentialSeqDelta
        }
      : undefined;

    const toolSetRuntimeNode = getMCPToolSetRuntimeNode({
      url,
      toolList,
      headerSecret: formatedHeaderAuth,
      authMode: effectiveAuthMode,
      oauth: nextOAuth,
      // 复用旧 nodeId，否则 OAuth 配置会写到孤立节点。
      nodeId: String(currentNode.nodeId),
      name: app.name,
      avatar: app.avatar ?? undefined
    });
    await beforeUpdateAppFormat({ nodes: [toolSetRuntimeNode], teamId });
    const storageNodes = encodeMcpToolSetNodesForStorage([toolSetRuntimeNode]);

    await updateAppPublishedVersion({
      appId,
      nodes: storageNodes,
      resources: [],
      session,
      // 只有节点原本已是 oauth 时才需要 seq 围栏：首次启用 oauth 时存库节点
      // 尚无 `authMode:'oauth'`，围栏过滤条件必然不命中（设计 §7.3 首次启用行）。
      ...(previousAuthMode === 'oauth'
        ? {
            nodeFence: {
              nodeId: String(currentNode.nodeId),
              credentialSeq: expectedCredentialSeq
            }
          }
        : {})
    });
  });
  updateParentFoldersUpdateTime({
    parentId: app.parentId
  });

  return UpdateMcpToolsResponseSchema.parse(undefined);
}

export default NextAPI(handler);
