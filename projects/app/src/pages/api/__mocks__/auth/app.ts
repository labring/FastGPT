import { TestAppType } from '@/test/test-cases/app';
import type { AuthResponseType } from '@fastgpt/service/support/permission/type';

let authAppRet: AuthResponseType & {
  app: TestAppType;
};

let authAppByTmbIdRet: {
  app: TestAppType;
};

jest.mock('@fastgpt/service/support/permission/app/auth', () => {
  return {
    // authApp: async ({
    //   appId,
    //   per,
    //   req
    // }: {
    //   appId: string;
    //   per: Permission;
    //   req: TestRequest;
    // }): Promise<
    //   AuthResponseType & {
    //     app: TestAppType;
    //   }
    // > => {
    //   if (!appId) {
    //     return Promise.reject(AppErrEnum.unExist);
    //   }
    //   const result = await MockParseHeaderCert({ req, authToken: true });
    //
    //   const { tmbId, isRoot } = result;
    //   const app = TestAppList.find((app) => app._id === appId);
    //   if (!app) {
    //     return Promise.reject(AppErrEnum.unExist);
    //   }
    //   if (isRoot) {
    //     return {
    //       ...result,
    //       permission: new Permission({ isOwner: true }),
    //       app
    //     };
    //   }
    //   return {
    //     ...result,
    //     permission: new Permission({ isOwner: false }), // TODO: unfinished
    //     app
    //   };
    // },
    // authAppByTmbId: async () => { };
    authApp: async () => authAppRet,
    authAppByTmbId: async () => authAppByTmbIdRet
  };
});

export const setAuthAppRet = (
  ret: AuthResponseType & {
    app: TestAppType;
  }
) => {
  authAppRet = ret;
};

export const setAuthAppByTmbIdRet = (ret: { app: TestAppType }) => {
  authAppByTmbIdRet = ret;
};
