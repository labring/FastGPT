import Cookie from 'cookie';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import jwt from 'jsonwebtoken';
import { NextApiResponse } from 'next';
import type { AuthModeType, ReqHeaderAuthType } from './type.d';
import { AuthUserTypeEnum, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { authOpenApiKey } from '../openapi/auth';
import { FileTokenQuery } from '@fastgpt/global/common/file/type';
import { MongoResourcePermission } from './schema';
import { ClientSession } from 'mongoose';
import {
  PermissionValueType,
  ResourcePermissionType,
  ResourcePerWithGroup,
  ResourcePerWithTmbWithUser
} from '@fastgpt/global/support/permission/type';
import { bucketNameMap } from '@fastgpt/global/common/file/constants';
import { addMinutes } from 'date-fns';
import { getGroupsByTmbId } from './memberGroup/controllers';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

/** get resource permission for a team member
 * If there is no permission for the team member, it will return undefined
 * @param resourceType: PerResourceTypeEnum
 * @param teamId
 * @param tmbId
 * @param resourceId
 * @returns PermissionValueType | undefined
 */
export const getResourcePermission = async ({
  resourceType,
  teamId,
  tmbId,
  resourceId
}: {
  teamId: string;
  tmbId: string;
} & (
  | {
      resourceType: 'team';
      resourceId?: undefined;
    }
  | {
      resourceType: Omit<PerResourceTypeEnum, 'team'>;
      resourceId: string;
    }
)): Promise<PermissionValueType | undefined> => {
  // Personal permission has the highest priority
  const tmbPer = (
    await MongoResourcePermission.findOne(
      {
        resourceType,
        teamId,
        resourceId,
        tmbId
      },
      'permission'
    ).lean()
  )?.permission;

  // could be 0
  if (tmbPer !== undefined) {
    return tmbPer;
  }

  // If there is no personal permission, get the group permission
  const groupIdList = (await getGroupsByTmbId({ tmbId, teamId })).map((item) => item._id);

  if (groupIdList.length === 0) {
    return undefined;
  }

  // get the maximum permission of the group
  const pers = (
    await MongoResourcePermission.find(
      {
        teamId,
        resourceType,
        groupId: {
          $in: groupIdList
        },
        resourceId
      },
      'permission'
    ).lean()
  ).map((item) => item.permission);

  const groupPer = getGroupPer(pers);

  return groupPer;
};

/* 仅取 members 不取 groups */
export async function getResourceAllClbs({
  resourceId,
  teamId,
  resourceType,
  session
}: {
  teamId: string;
  session?: ClientSession;
} & (
  | {
      resourceType: 'team';
      resourceId?: undefined;
    }
  | {
      resourceType: Omit<PerResourceTypeEnum, 'team'>;
      resourceId?: string | null;
    }
)): Promise<ResourcePermissionType[]> {
  return MongoResourcePermission.find(
    {
      resourceType: resourceType,
      teamId: teamId,
      resourceId,
      groupId: {
        $exists: false
      }
    },
    null,
    {
      session
    }
  ).lean();
}

export async function getResourceClbsAndGroups({
  resourceId,
  resourceType,
  teamId,
  session
}: {
  resourceId: ParentIdType;
  resourceType: Omit<`${PerResourceTypeEnum}`, 'team'>;
  teamId: string;
  session: ClientSession;
}) {
  return MongoResourcePermission.find(
    {
      resourceId,
      resourceType,
      teamId
    },
    undefined,
    { session }
  ).lean();
}

export const getClbsAndGroupsWithInfo = async ({
  resourceId,
  resourceType,
  teamId
}: {
  resourceId: ParentIdType;
  resourceType: Omit<`${PerResourceTypeEnum}`, 'team'>;
  teamId: string;
}) =>
  Promise.all([
    (await MongoResourcePermission.find({
      teamId,
      resourceId,
      resourceType,
      tmbId: {
        $exists: true
      }
    }).populate({
      path: 'tmbId',
      select: 'name userId',
      populate: {
        path: 'userId',
        select: 'avatar'
      }
    })) as ResourcePerWithTmbWithUser[],
    (await MongoResourcePermission.find({
      teamId,
      resourceId,
      resourceType,
      groupId: {
        $exists: true
      }
    }).populate({
      path: 'groupId',
      select: 'name avatar'
    })) as ResourcePerWithGroup[]
  ]);

export const delResourcePermissionById = (id: string) => {
  return MongoResourcePermission.findByIdAndRemove(id);
};
export const delResourcePermission = ({
  session,
  tmbId,
  groupId,
  ...props
}: {
  resourceType: PerResourceTypeEnum;
  teamId: string;
  resourceId: string;
  session?: ClientSession;
  tmbId?: string;
  groupId?: string;
}) => {
  // tmbId or groupId only one and not both
  if (!!tmbId === !!groupId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }
  return MongoResourcePermission.deleteOne(
    {
      ...(tmbId ? { tmbId } : {}),
      ...(groupId ? { groupId } : {}),
      ...props
    },
    { session }
  );
};

/* 下面代码等迁移 */
/* create token */
export function createJWT(user: {
  _id?: string;
  team?: { teamId?: string; tmbId: string };
  isRoot?: boolean;
}) {
  const key = process.env.TOKEN_KEY as string;
  const token = jwt.sign(
    {
      userId: String(user._id),
      teamId: String(user.team?.teamId),
      tmbId: String(user.team?.tmbId),
      isRoot: user.isRoot,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    },
    key
  );
  return token;
}

// auth token
export function authJWT(token: string) {
  return new Promise<{
    userId: string;
    teamId: string;
    tmbId: string;
    isRoot: boolean;
  }>((resolve, reject) => {
    const key = process.env.TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded?.userId) {
        reject(ERROR_ENUM.unAuthorization);
        return;
      }

      resolve({
        userId: decoded.userId,
        teamId: decoded.teamId || '',
        tmbId: decoded.tmbId,
        isRoot: decoded.isRoot
      });
    });
  });
}

export async function parseHeaderCert({
  req,
  authToken = false,
  authRoot = false,
  authApiKey = false
}: AuthModeType) {
  // parse jwt
  async function authCookieToken(cookie?: string, token?: string) {
    // 获取 cookie
    const cookies = Cookie.parse(cookie || '');
    const cookieToken = token || cookies[TokenName];

    if (!cookieToken) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    return await authJWT(cookieToken);
  }
  // from authorization get apikey
  async function parseAuthorization(authorization?: string) {
    if (!authorization) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    // Bearer fastgpt-xxxx-appId
    const auth = authorization.split(' ')[1];
    if (!auth) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }

    const { apikey, appId: authorizationAppid = '' } = await (async () => {
      const arr = auth.split('-');
      // abandon
      if (arr.length === 3) {
        return {
          apikey: `${arr[0]}-${arr[1]}`,
          appId: arr[2]
        };
      }
      if (arr.length === 2) {
        return {
          apikey: auth
        };
      }
      return Promise.reject(ERROR_ENUM.unAuthorization);
    })();

    // auth apikey
    const { teamId, tmbId, appId: apiKeyAppId = '', sourceName } = await authOpenApiKey({ apikey });

    return {
      uid: '',
      teamId,
      tmbId,
      apikey,
      appId: apiKeyAppId || authorizationAppid,
      sourceName
    };
  }
  // root user
  async function parseRootKey(rootKey?: string) {
    if (!rootKey || !process.env.ROOT_KEY || rootKey !== process.env.ROOT_KEY) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
  }

  const { cookie, token, rootkey, authorization } = (req.headers || {}) as ReqHeaderAuthType;

  const { uid, teamId, tmbId, appId, openApiKey, authType, isRoot, sourceName } =
    await (async () => {
      if (authApiKey && authorization) {
        // apikey from authorization
        const authResponse = await parseAuthorization(authorization);
        return {
          uid: authResponse.uid,
          teamId: authResponse.teamId,
          tmbId: authResponse.tmbId,
          appId: authResponse.appId,
          openApiKey: authResponse.apikey,
          authType: AuthUserTypeEnum.apikey,
          sourceName: authResponse.sourceName
        };
      }
      if (authToken && (token || cookie)) {
        // user token(from fastgpt web)
        const res = await authCookieToken(cookie, token);
        return {
          uid: res.userId,
          teamId: res.teamId,
          tmbId: res.tmbId,
          appId: '',
          openApiKey: '',
          authType: AuthUserTypeEnum.token,
          isRoot: res.isRoot
        };
      }
      if (authRoot && rootkey) {
        await parseRootKey(rootkey);
        // root user
        return {
          uid: '',
          teamId: '',
          tmbId: '',
          appId: '',
          openApiKey: '',
          authType: AuthUserTypeEnum.root,
          isRoot: true
        };
      }

      return Promise.reject(ERROR_ENUM.unAuthorization);
    })();

  if (!authRoot && (!teamId || !tmbId)) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return {
    userId: String(uid),
    teamId: String(teamId),
    tmbId: String(tmbId),
    appId,
    authType,
    sourceName,
    apikey: openApiKey,
    isRoot: !!isRoot
  };
}

/* set cookie */
export const TokenName = 'fastgpt_token';
export const setCookie = (res: NextApiResponse, token: string) => {
  res.setHeader(
    'Set-Cookie',
    `${TokenName}=${token}; Path=/; HttpOnly; Max-Age=604800; Samesite=Strict;`
  );
};
/* clear cookie */
export const clearCookie = (res: NextApiResponse) => {
  res.setHeader('Set-Cookie', `${TokenName}=; Path=/; Max-Age=0`);
};

/* file permission */
export const createFileToken = (data: FileTokenQuery) => {
  if (!process.env.FILE_TOKEN_KEY) {
    return Promise.reject('System unset FILE_TOKEN_KEY');
  }

  const expireMinutes = bucketNameMap[data.bucketName].previewExpireMinutes;
  const expiredTime = Math.floor(addMinutes(new Date(), expireMinutes).getTime() / 1000);

  const key = (process.env.FILE_TOKEN_KEY as string) ?? 'filetoken';
  const token = jwt.sign(
    {
      ...data,
      exp: expiredTime
    },
    key
  );
  return Promise.resolve(token);
};

export const authFileToken = (token?: string) =>
  new Promise<FileTokenQuery>((resolve, reject) => {
    if (!token) {
      return reject(ERROR_ENUM.unAuthFile);
    }
    const key = (process.env.FILE_TOKEN_KEY as string) ?? 'filetoken';

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded.bucketName || !decoded?.teamId || !decoded?.tmbId || !decoded?.fileId) {
        reject(ERROR_ENUM.unAuthFile);
        return;
      }
      resolve({
        bucketName: decoded.bucketName,
        teamId: decoded.teamId,
        tmbId: decoded.tmbId,
        fileId: decoded.fileId
      });
    });
  });

export const getGroupPer = (groups: PermissionValueType[] = []) => {
  if (groups.length === 0) {
    return undefined;
  }

  return new Permission().addPer(...groups).value;
};
