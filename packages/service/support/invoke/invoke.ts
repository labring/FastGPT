import jwt from 'jsonwebtoken';
import { getChatFileTypeByFilename } from '@fastgpt/global/core/chat/file/utils';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { i18nT, parseLocale, selectPluginText } from '@fastgpt/global/common/i18n/utils';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { getTeamPluginSource, splitCombineToolId } from '@fastgpt/global/core/app/tool/utils';
import {
  PluginPermissionEnum,
  type PluginPermissionEnumType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import { ChatFileTypeEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import type {
  InvokeFileUploadResponseType,
  InvokeUserInfoResponseType
} from '@fastgpt/global/openapi/plugin/invoke';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import { removeS3TTL } from '../../common/s3/utils';
import { getStorageFileUrlExpiredTime } from '../../common/s3/config/constants';
import { SystemToolRepo } from '../../core/app/tool/systemTool/systemTool.repo';
import { serviceEnv } from '../../env';
import { getGroupsByTmbId } from '../permission/memberGroup/controllers';
import { getOrgsByTmbId } from '../permission/org/controllers';
import { MongoOrgModel } from '../permission/org/orgSchema';
import { getUserDetail } from '../user/controller';
import { MongoTeam } from '../user/team/teamSchema';
import { InvokeFileUploadSchema, InvokeSessionSchema, type InvokeFileUploadType } from './type';
import type { InvokeSessionType } from './type';

const INVOKE_TOKEN_EXPIRES_IN = 60 * 60;
export const DEFAULT_INVOKE_TOOL_NAME = i18nT('app:core.module.template.System Tools');

/**
 * 根据 invokeToken 中的 toolId 安全解析工具展示名，用于反向调用账单明细 moduleName。
 *
 * 解析失败或 toolId 为空时逐级回退到原始 toolId 与通用系统工具 i18n 文案，
 * 保证任何工具元数据查询失败都不会阻断模型反向调用或计费记账。
 */
export const resolveInvokeToolName = async ({
  toolId,
  teamId,
  tmbId,
  lang
}: {
  toolId?: string;
  teamId?: string;
  tmbId?: string;
  lang?: string;
}): Promise<string> => {
  const trimmedToolId = toolId?.trim() ?? '';
  if (trimmedToolId === '') {
    return DEFAULT_INVOKE_TOOL_NAME;
  }

  // 1. 归一化组合工具 ID，兼容带前缀的标准 ID 与不带前缀的原始插件 ID。
  const normalizedPluginId = (() => {
    try {
      const { source, pluginId } = splitCombineToolId(trimmedToolId);
      if (source === AppToolSourceEnum.systemTool || source === AppToolSourceEnum.commercial) {
        return `${source}-${pluginId}`;
      }
      return `${AppToolSourceEnum.systemTool}-${trimmedToolId}`;
    } catch {
      return `${AppToolSourceEnum.systemTool}-${trimmedToolId}`;
    }
  })();

  const resolvedLocale = parseLocale(lang);
  const isCommercialTool = normalizedPluginId.startsWith(`${AppToolSourceEnum.commercial}-`);
  const candidateSources = isCommercialTool
    ? ['system']
    : [
        'system',
        ...(teamId ? [getTeamPluginSource(teamId)] : []),
        ...(tmbId ? [`debug:tmbId:${tmbId}`] : [])
      ];

  // 2. 按系统/商业工具 -> 团队插件 -> 调试工具顺序解析名称，异常时静默降级。
  for (const source of candidateSources) {
    try {
      const systemToolRepo = SystemToolRepo.getInstance();
      const toolInfo = systemToolRepo.getSystemToolDisplayInfo
        ? await systemToolRepo.getSystemToolDisplayInfo({
            pluginId: normalizedPluginId,
            source,
            lang: resolvedLocale
          })
        : await systemToolRepo.getSystemToolDetail({
            pluginId: normalizedPluginId,
            source,
            lang: resolvedLocale,
            fallbackLatestVersion: true
          });

      const resolvedName =
        selectPluginText(toolInfo?.name, resolvedLocale).trim() ||
        selectPluginText(toolInfo?.name, LangEnum.zh_CN).trim() ||
        selectPluginText(toolInfo?.name, LangEnum.en).trim();

      if (resolvedName !== '') {
        return resolvedName;
      }
    } catch {
      // 工具查询异常不影响计费主流程，继续尝试候选 source 或使用最终兜底。
    }
  }

  return trimmedToolId;
};

/** 反向调用处理器 */
export class InvokeProcessor {
  private _session: InvokeSessionType;
  static jwtSecret = serviceEnv.INVOKE_TOKEN_SECRET;

  public get session(): InvokeSessionType {
    return this._session;
  }

  constructor(options: InvokeSessionType) {
    this._session = options;
  }

  generateToken(): string {
    const session = InvokeSessionSchema.parse(this._session);

    return jwt.sign(session, InvokeProcessor.jwtSecret, {
      expiresIn: INVOKE_TOKEN_EXPIRES_IN
    });
  }

  static getInstanceFromToken(token?: string): InvokeProcessor {
    if (!token) {
      throw ERROR_ENUM.unAuthorization;
    }
    try {
      const payload = jwt.verify(token, this.jwtSecret);
      const session = InvokeSessionSchema.parse(payload);

      return new InvokeProcessor(session);
    } catch {
      throw ERROR_ENUM.unAuthorization;
    }
  }

  assertPermission(permission: PluginPermissionEnumType) {
    const { permissions } = InvokeSessionSchema.parse(this._session);

    if (!permissions.includes(permission)) {
      throw ERROR_ENUM.unAuthorization;
    }
  }

  assertModelInvokePermission() {
    this.assertPermission(PluginPermissionEnum['model:invoke']);
  }

  getSessionWithPermission(permission: PluginPermissionEnumType): InvokeSessionType {
    this.assertPermission(permission);
    return InvokeSessionSchema.parse(this._session);
  }

  getModelInvokeSession(): InvokeSessionType {
    return this.getSessionWithPermission(PluginPermissionEnum['model:invoke']);
  }

  async resolveToolName(options?: string | { lang?: string }): Promise<string> {
    const lang = typeof options === 'string' ? options : options?.lang;
    const { toolId, teamId, tmbId } = InvokeSessionSchema.parse(this._session);
    return resolveInvokeToolName({
      toolId,
      teamId,
      tmbId,
      lang
    });
  }

  async handleFileUpload(params: InvokeFileUploadType): Promise<InvokeFileUploadResponseType> {
    this.assertPermission(PluginPermissionEnum['file-upload:allow']);

    const { appId, chatId, uId } = InvokeSessionSchema.parse(this._session);

    const { filename, body, contentType } = InvokeFileUploadSchema.parse(params);
    const result = await getS3ChatSource().uploadChatFile({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId,
      uId,
      filename,
      body,
      contentType,
      expiredTime: getStorageFileUrlExpiredTime()
    });

    await removeS3TTL({ key: result.key, bucketName: 'private' });

    const type = (() => {
      if (contentType?.startsWith('image/')) return ChatFileTypeEnum.image;
      if (contentType?.startsWith('audio/')) return ChatFileTypeEnum.audio;
      if (contentType?.startsWith('video/')) return ChatFileTypeEnum.video;

      return getChatFileTypeByFilename(filename);
    })();

    return {
      url: result.accessUrl.url,
      key: result.key,
      filename,
      contentType,
      type
    };
  }

  async handleGetUserInfo(): Promise<InvokeUserInfoResponseType> {
    this.assertPermission(PluginPermissionEnum['userInfo:read']);

    const { tmbId, teamId } = InvokeSessionSchema.parse(this._session);

    const [user, orgs, groups, team] = await Promise.all([
      getUserDetail({ tmbId }),
      getOrgsByTmbId({ teamId, tmbId }),
      getGroupsByTmbId({ tmbId, teamId }),
      MongoTeam.findById(teamId, {
        name: 1
      }).lean()
    ]);

    if (!team) throw new Error('Team not found');

    const orgInfos = orgs.length
      ? await MongoOrgModel.find(
          {
            _id: {
              $in: orgs.map((org) => org.orgId)
            }
          },
          {
            name: 1,
            pathId: 1
          }
        ).lean()
      : [];

    return {
      username: user.username,
      memberName: user.team.memberName,
      contact: user.contact,
      orgs: orgInfos.map((org) => ({
        name: org.name,
        pathId: org.pathId
      })),
      groups: groups.map((group) => ({
        name: group.name === DefaultGroupName ? team.name : group.name
      }))
    };
  }
}
