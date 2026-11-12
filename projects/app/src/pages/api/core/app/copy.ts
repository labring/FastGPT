import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { onCreateApp } from './create';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { copyAvatarImage } from '@fastgpt/service/common/file/image/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CopyAppBodySchema,
  CopyAppResponseSchema,
  type CopyAppBodyType,
  type CopyAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  encodeHttpToolSetNodesForStorage,
  encodeMcpToolSetNodesForStorage
} from '@fastgpt/service/core/app/jsonSchemaStorage';
import { getAppDraftWorkflow } from '@fastgpt/service/core/app/version/controller';
import { mergeMcpOAuthFromPublished } from '@fastgpt/service/core/app/mcpOAuth/credential';
import type { McpToolSetOAuthConfigType } from '@fastgpt/global/core/app/tool/mcpTool/oauthConfig';

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 复制边界上的 OAuth 清洗（v2.4 §10）：
 * - 同团队复制保留完整 oauth（token / clientSecret / credentialSeq 均可复用，复制后无需重新授权）；
 * - 跨团队 / 导出 / 公共模板剥离 token、clientSecret、registrationAccessToken 与租约，
 *   仅保留 authMode、clientMode、scope、issuer/server 等非密配置；CIMD 可保留 clientId。
 */
const sanitizeMcpOAuthForCopy = ({
  oauth,
  keepCredentials
}: {
  oauth: unknown;
  keepCredentials: boolean;
}) => {
  if (!isRecord(oauth)) return oauth;

  if (keepCredentials) {
    // 复用写路径纯函数：authMode 未变化且 URL 未变化，token 与 credentialSeq 原样保留。
    return mergeMcpOAuthFromPublished({
      existingOAuth: oauth as McpToolSetOAuthConfigType,
      previousAuthMode: 'oauth',
      nextAuthMode: 'oauth',
      urlChanged: false
    }).oauth;
  }

  const { token, refreshLease, revokeLease, client, ...rest } = oauth;
  // clientId 只在 CIMD 场景可复用（公开文档标识，不含密钥）。
  const keepCimdClientId =
    oauth.clientSource === 'cimd' && isRecord(client) && typeof client.clientId === 'string';
  return {
    ...rest,
    ...(keepCimdClientId
      ? {
          client: {
            clientId: client.clientId,
            ...(typeof client.tokenEndpointAuthMethod === 'string'
              ? { tokenEndpointAuthMethod: client.tokenEndpointAuthMethod }
              : {})
          }
        }
      : {})
  };
};

/** 复制前清洗每个 MCP 工具集节点；非 MCP 节点原样返回。 */
const sanitizeMcpToolSetNodesForCopy = <T>({
  nodes,
  keepCredentials
}: {
  nodes: T;
  keepCredentials: boolean;
}): T => {
  if (!Array.isArray(nodes)) return nodes;

  const sanitizedNodes = nodes.map((node) => {
    if (!isRecord(node) || !isRecord(node.toolConfig)) return node;
    const toolSet = node.toolConfig.mcpToolSet;
    if (!isRecord(toolSet) || !('oauth' in toolSet)) return node;

    return {
      ...node,
      toolConfig: {
        ...node.toolConfig,
        mcpToolSet: {
          ...toolSet,
          oauth: sanitizeMcpOAuthForCopy({ oauth: toolSet.oauth, keepCredentials })
        }
      }
    };
  });

  return sanitizedNodes as T;
};

async function handler(req: ApiRequestProps<CopyAppBodyType>): Promise<CopyAppResponseType> {
  const { appId: sourceAppId } = parseApiInput({
    req,
    bodySchema: CopyAppBodySchema
  }).body;

  const { app, teamId: operatorTeamId } = await authApp({
    req,
    authToken: true,
    per: WritePermissionVal,
    appId: sourceAppId
  });
  const teamId = String(app.teamId);
  // 复制只在同团队内进行（authApp 已拒绝跨团队访问）；跨团队/模板复制走同一清洗分支兜底。
  const keepOAuthCredentials = String(app.teamId) === String(operatorTeamId);

  const { tmbId, isRoot } = app.parentId
    ? await authApp({ req, appId: app.parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  // Copy avatar
  const { appId } = await mongoSessionRun(async (session) => {
    const avatar = await copyAvatarImage({
      teamId,
      imageUrl: app.avatar,
      temporary: true,
      session
    });

    const draftWorkflow = await getAppDraftWorkflow(app._id, app);
    // nodes 与 storageNodes 使用同一份清洗结果，避免运行时视图与落库快照不一致。
    const copyNodes = sanitizeMcpToolSetNodesForCopy({
      nodes: draftWorkflow.nodes,
      keepCredentials: keepOAuthCredentials
    });
    const storageNodes = (() => {
      if (app.type === AppTypeEnum.mcpToolSet) {
        // encode 前后各清洗一次：编码只改 JSON Schema 形态，清洗保持幂等。
        return sanitizeMcpToolSetNodesForCopy({
          nodes: encodeMcpToolSetNodesForStorage(copyNodes),
          keepCredentials: keepOAuthCredentials
        });
      }
      if (app.type === AppTypeEnum.httpToolSet) {
        return encodeHttpToolSetNodesForStorage(copyNodes);
      }
      // 普通应用必须写入 onCreateApp 清洗后的 workflow，不能用原始存储数据绕过模型校验。
      return undefined;
    })();
    const appId = await onCreateApp({
      parentId: app.parentId,
      name: app.name + ' Copy',
      intro: app.intro,
      avatar,
      type: app.type,
      nodes: copyNodes,
      storageNodes,
      edges: draftWorkflow.edges,
      chatConfig: draftWorkflow.chatConfig,
      teamId,
      tmbId,
      isRoot,
      pluginData: app.pluginData,
      session
    });

    await getS3AvatarSource().refreshAvatar(avatar, undefined, session);

    return { appId };
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_APP_COPY,
      params: {
        appName: app.name,
        appType: getI18nAppType(app.type)
      }
    });
  })();

  return CopyAppResponseSchema.parse({ appId });
}

export default NextAPI(handler);
