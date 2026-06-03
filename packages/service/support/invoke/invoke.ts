import jwt from 'jsonwebtoken';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import {
  PluginPermissionEnum,
  type PluginPermissionEnumType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import type { InvokeUserInfoResponseType } from '@fastgpt/global/openapi/plugin/invoke';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import { serviceEnv } from '../../env';
import { getGroupsByTmbId } from '../permission/memberGroup/controllers';
import { getOrgsByTmbId } from '../permission/org/controllers';
import { MongoOrgModel } from '../permission/org/orgSchema';
import { getUserDetail } from '../user/controller';
import { MongoTeam } from '../user/team/teamSchema';
import { InvokeFileUploadSchema, InvokeSessionSchema, type InvokeFileUploadType } from './type';
import type { InvokeSessionType } from './type';

const INVOKE_TOKEN_EXPIRES_IN = 60 * 60;

/** 反向调用处理器 */
export class InvokeProcessor {
  private _session: InvokeSessionType;
  static jwtSecret = serviceEnv.INVOKE_TOKEN_SECRET;

  public get session(): InvokeSessionType {
    return this.session;
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
    } catch (error) {
      throw ERROR_ENUM.unAuthorization;
    }
  }

  private assertPermission(permission: PluginPermissionEnumType) {
    const { permissions } = InvokeSessionSchema.parse(this._session);

    if (!permissions.includes(permission)) {
      throw ERROR_ENUM.unAuthorization;
    }
  }

  getSessionWithPermission(permission: PluginPermissionEnumType): InvokeSessionType {
    this.assertPermission(permission);
    return InvokeSessionSchema.parse(this._session);
  }

  async handleFileUpload(params: InvokeFileUploadType): Promise<{ url: string }> {
    this.assertPermission(PluginPermissionEnum['file-upload:allow']);

    const { appId, chatId, uId } = InvokeSessionSchema.parse(this._session);

    const { filename, body, contentType, expiredTime } = InvokeFileUploadSchema.parse(params);
    const result = await getS3ChatSource().uploadChatFile({
      appId,
      chatId,
      uId,
      filename,
      body,
      contentType,
      expiredTime
    });

    return {
      url: result.accessUrl.url
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
