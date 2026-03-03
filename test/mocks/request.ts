import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import type { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import { MongoGroupMemberModel } from '@fastgpt/service/support/permission/memberGroup/groupMemberSchema';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { vi } from 'vitest';

vi.mock('@fastgpt/service/common/middle/entry', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  const NextEntry = vi.fn(({ beforeCallback = [] }: { beforeCallback?: Promise<any>[] }) => {
    return (...args: any) => {
      return async function api(req: any, res: any) {
        try {
          await Promise.all([...beforeCallback]);
          let response = null;
          for await (const handler of args) {
            response = await handler(req, res);
            if (res.writableFinished) {
              break;
            }
          }
          return {
            code: 200,
            data: response
          };
        } catch (error) {
          return {
            code: 500,
            error,
            url: req.url
          };
        }
      };
    };
  });

  return {
    ...mod,
    NextEntry
  };
});

export type parseHeaderCertRet = {
  userId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  authType: AuthUserTypeEnum;
  sourceName: string | undefined;
  apikey: string;
  isRoot: boolean;
  sessionId: string;
};

export type MockReqType<B = any, Q = any> = {
  body?: B;
  query?: Q;
  headers?: Record<string, any>;
  auth?: parseHeaderCertRet;
  [key: string]: any;
};

vi.mock('@fastgpt/service/support/permission/auth/common', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  const parseHeaderCert = vi.fn(
    ({
      req,
      authToken = false,
      authRoot = false,
      authApiKey = false
    }: {
      req: MockReqType;
      authToken?: boolean;
      authRoot?: boolean;
      authApiKey?: boolean;
    }) => {
      const { auth } = req;
      if (!auth) {
        return Promise.reject(Error('unAuthorization'));
      }
      return Promise.resolve(auth);
    }
  );

  const authCert = async (props: any) => {
    const result = await parseHeaderCert(props);

    return {
      ...result,
      isOwner: true,
      canWrite: true
    };
  };

  const setCookie = vi.fn();

  return {
    ...mod,
    parseHeaderCert,
    authCert,
    setCookie
  };
});

vi.mock('@fastgpt/service/support/permission/memberGroup/controllers', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  const parseHeaderCert = vi.fn(
    ({
      req,
      authToken = false,
      authRoot = false,
      authApiKey = false
    }: {
      req: MockReqType;
      authToken?: boolean;
      authRoot?: boolean;
      authApiKey?: boolean;
    }) => {
      const { auth } = req;
      if (!auth) {
        return Promise.reject(Error('unAuthorization(mock)'));
      }
      return Promise.resolve(auth);
    }
  );
  const authGroupMemberRole = vi.fn(async ({ groupId, role, ...props }: any) => {
    const result = await parseHeaderCert(props);
    const { teamId, tmbId, isRoot } = result;
    if (isRoot) {
      return {
        ...result,
        permission: new TeamPermission({
          isOwner: true
        }),
        teamId,
        tmbId
      };
    }
    const [groupMember, tmb] = await Promise.all([
      MongoGroupMemberModel.findOne({ groupId, tmbId }),
      getTmbInfoByTmbId({ tmbId })
    ]);

    // Team admin or role check
    if (tmb.permission.hasManagePer || (groupMember && role.includes(groupMember.role))) {
      return {
        ...result,
        permission: tmb.permission,
        teamId,
        tmbId
      };
    }
    return Promise.reject(TeamErrEnum.unAuthTeam);
  });
  return {
    ...mod,
    authGroupMemberRole
  };
});
